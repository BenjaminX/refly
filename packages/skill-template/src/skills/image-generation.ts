import { START, END, StateGraphArgs, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { BaseSkill, BaseSkillState, SkillRunnableConfig, baseStateGraphArgs } from '../base';
import { SystemMessage, AIMessage } from '@langchain/core/messages';
import {
  Icon,
  SkillInvocationConfig,
  SkillTemplateConfigDefinition,
  Artifact,
  InputMode,
  ArtifactType,
  CanvasNodeData,
  CanvasNodeType,
  CanvasNode,
} from '@refly/openapi-schema';
import { GraphState } from '../scheduler/types';
import { genImageID } from '@refly/utils';

// 扩展GraphState接口以包含gen_id属性
interface ImageGenerationState extends GraphState {
  gen_id?: string;
}

/**
 * Image Generation Skill
 *
 * Generates images based on text prompts using external API services
 */
export class ImageGeneration extends BaseSkill {
  name = 'imageGeneration';
  displayName = {
    en: 'Image Generation',
    'zh-CN': '图像生成',
  };

  icon: Icon = { type: 'emoji', value: '🖼️' };

  configSchema: SkillTemplateConfigDefinition = {
    items: [
      {
        key: 'apiUrl',
        inputMode: 'input' as InputMode,
        defaultValue: 'https://api.tu-zi.com/v1/chat/completions',
        labelDict: {
          en: 'API URL',
          'zh-CN': 'API 地址',
        },
        descriptionDict: {
          en: 'The API endpoint for image generation',
          'zh-CN': '图像生成API接口地址',
        },
      },
      {
        key: 'apiKey',
        inputMode: 'input' as InputMode,
        defaultValue: '',
        labelDict: {
          en: 'API Key',
          'zh-CN': 'API 密钥',
        },
        descriptionDict: {
          en: 'Your API key for the image generation service',
          'zh-CN': '图像生成服务的API密钥',
        },
      },
      {
        key: 'imageRatio',
        inputMode: 'select' as InputMode,
        defaultValue: '1:1',
        labelDict: {
          en: 'Image Ratio',
          'zh-CN': '图像比例',
        },
        descriptionDict: {
          en: 'The aspect ratio of generated images',
          'zh-CN': '生成图像的宽高比',
        },
        options: [
          {
            value: '1:1',
            labelDict: { en: '1:1 (Square)', 'zh-CN': '1:1 (正方形)' },
          },
          {
            value: '16:9',
            labelDict: { en: '16:9 (Landscape)', 'zh-CN': '16:9 (横向)' },
          },
          {
            value: '9:16',
            labelDict: { en: '9:16 (Portrait)', 'zh-CN': '9:16 (纵向)' },
          },
        ],
      },
      {
        key: 'model',
        inputMode: 'select' as InputMode,
        defaultValue: 'gpt-4o-image-vip',
        labelDict: {
          en: 'Model',
          'zh-CN': '模型',
        },
        descriptionDict: {
          en: 'The model to use for image generation',
          'zh-CN': '用于图像生成的模型',
        },
        options: [
          {
            value: 'gpt-4o-image-vip',
            labelDict: { en: 'GPT-4o-image-vip', 'zh-CN': 'GPT-4o-image-vip' },
          },
          {
            value: 'gpt-4o-image',
            labelDict: { en: 'GPT-4o-image', 'zh-CN': 'GPT-4o-image' },
          },
        ],
      },
    ],
  };

  invocationConfig: SkillInvocationConfig = {};

  description = '根据文本提示使用AI模型生成图像';

  schema = z.object({
    query: z.string().describe('The prompt for image generation'),
    gen_id: z.string().optional().describe('The ID of a previously generated image to edit'),
  });

  graphState: StateGraphArgs<BaseSkillState>['channels'] = {
    ...baseStateGraphArgs,
  };

  async generateImage(
    state: ImageGenerationState,
    config: SkillRunnableConfig,
  ): Promise<Partial<GraphState>> {
    const { query, gen_id } = state;
    const { tplConfig } = config.configurable;

    if (!query) {
      throw new Error('A prompt is required for image generation');
    }

    // Extract configuration values with defaults
    const apiUrl = tplConfig?.apiUrl?.value ?? 'https://api.tu-zi.com/v1/chat/completions';
    const apiKey = tplConfig?.apiKey?.value ?? '';
    const ratio = tplConfig?.imageRatio?.value ?? '1:1';
    const model = tplConfig?.model?.value ?? 'gpt-4o-image-vip';

    if (!apiKey) {
      throw new Error('API key is required for image generation');
    }

    config.metadata.step = { name: 'generateImage' };

    try {
      // Log the generation attempt
      this.emitEvent(
        {
          event: 'log',
          log: {
            key: 'image.generating',
            titleArgs: {
              prompt: query,
            },
          },
        },
        config,
      );

      // Prepare the first message with proper JSON format
      const jsonConfig = {
        prompt: query,
        ratio: ratio,
      };

      // If gen_id is provided, add it to the JSON config for image editing
      const finalConfig = gen_id ? { ...jsonConfig, gen_id } : jsonConfig;

      // Create the message with proper formatting for the API
      const messages = [
        {
          role: 'user',
          content: `\`\`\`\n${JSON.stringify(finalConfig, null, 2)}\n\`\`\``,
        },
      ];

      // Add gen_id if provided for image editing
      const requestBody = {
        stream: true, // Use streaming for more responsive feedback
        model: model,
        messages: messages,
      };

      // Setup headers
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

      this.emitEvent(
        {
          event: 'log',
          log: {
            key: 'image.api.request',
            titleArgs: {
              url: apiUrl,
            },
          },
        },
        config,
      );

      // Make the API request
      const response = await fetch(apiUrl as string, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`图像生成失败: ${response.status} - ${errorText}`);
      }

      // Process the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let imageUrl = '';
      let genId = '';
      let fullResponse = '';

      // Stream reading logic with timeout
      const decoder = new TextDecoder();
      let done = false;

      // Set a timeout for reading the stream
      const timeout = 6000000; // 6000 seconds timeout
      const startTime = Date.now();

      while (!done && Date.now() - startTime < timeout) {
        const result = await reader.read();
        done = result.done;

        if (!done && result.value) {
          const chunk = decoder.decode(result.value, { stream: true });
          fullResponse += chunk;

          // Try to extract image URL and gen_id from accumulated response
          const urlMatch = fullResponse.match(/!\[.*?\]\((https:\/\/.*?)\)/);
          if (urlMatch?.[1] && !imageUrl) {
            imageUrl = urlMatch[1];
            console.log('Found image URL:', imageUrl);
          }

          const genIdMatch = fullResponse.match(/gen_id: `(.*?)`/);
          if (genIdMatch?.[1] && !genId) {
            genId = genIdMatch[1];
            console.log('Found gen_id:', genId);
          }

          // If we have both URL and gen_id, we can stop reading
          if (imageUrl && genId) {
            break;
          }
        }
      }

      // If we couldn't find the image URL or gen_id in the response
      if (!imageUrl) {
        throw new Error('无法从响应中提取图像URL');
      }

      // Create artifact for the image
      const imageTitle = `生成图像: ${query.substring(0, 30)}${query.length > 30 ? '...' : ''}`;
      const imageId = genImageID();
      const storageKey = `${imageId}-${Date.now()}`;

      const artifact: Artifact = {
        entityId: imageId,
        type: 'document' as ArtifactType,
        title: imageTitle,
        content: '',
        status: 'finish',
        metadata: {
          url: imageUrl,
          prompt: query,
          gen_id: genId || 'unknown',
          model: model,
          ratio: ratio,
          mimeType: 'image/png',
        },
      };

      // Emit the artifact event which will be handled by the system
      this.emitEvent(
        {
          event: 'artifact',
          artifact,
        },
        config,
      );

      // 准备节点数据 - 按照ImageNodeMeta的要求设置
      const nodeData: CanvasNodeData = {
        title: imageTitle,
        entityId: imageId,
        metadata: {
          imageUrl: imageUrl, // 必需的字段
          imageType: 'png', // 必需的字段
          storageKey: storageKey, // 必需的字段
          showBorder: true,
          showTitle: true,
          sizeMode: 'adaptive',
          prompt: query,
          gen_id: genId || 'unknown',
          model: model,
          ratio: ratio,
          originalWidth: 400, // 添加默认宽度
          style: {}, // 添加空样式对象
        },
      };

      // 创建完整的Canvas节点
      const canvasNode: CanvasNode = {
        type: 'image' as CanvasNodeType,
        data: nodeData,
      };

      // Emit an event to create a new image node in the canvas
      this.emitEvent(
        {
          event: 'create_node',
          node: canvasNode,
        },
        config,
      );

      // Create a special response message that includes the content needed for the AI message
      // This format ensures the image is displayed properly in the UI
      const aiMessageContent = [
        {
          type: 'image_url',
          image_url: {
            url: imageUrl,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: `\n\n**生成的图像**\n\n提示词: ${query}\n\n图像ID: ${genId || 'unknown'}`,
        },
      ];

      // Also create a plain system message as fallback
      const systemMessage = new SystemMessage(
        `![${imageTitle}](${imageUrl})\n\n生成的图像ID: ${genId || 'unknown'}\n\n提示词: ${query}`,
      );

      // Try to create an AI message with multimodal content
      try {
        // Create an AI message with the image content
        const aiMessage = new AIMessage({
          content: aiMessageContent,
        });

        return { messages: [aiMessage] };
      } catch (error) {
        console.error('Error creating AI message with image:', error);
        // Fallback to system message if AI message creation fails
        return { messages: [systemMessage] };
      }
    } catch (error) {
      console.error('Image generation error:', error);

      // Handle errors
      this.emitEvent(
        {
          event: 'error',
          error: error.message || 'Unknown error during image generation',
        },
        config,
      );

      return {
        messages: [new SystemMessage(`图像生成错误: ${error.message}`)],
      };
    }
  }

  toRunnable(): Runnable<any, any, RunnableConfig> {
    const workflow = new StateGraph<GraphState>({
      channels: this.graphState,
    })
      .addNode('generateImage', this.generateImage.bind(this))
      .addEdge(START, 'generateImage')
      .addEdge('generateImage', END);

    return workflow.compile();
  }
}
