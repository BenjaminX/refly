import {
  SkillContextContentItem,
  SkillContextResourceItem,
  SkillContextProjectItem,
  Source,
  SkillContextCanvasItem,
} from '@refly-packages/openapi-schema';
import { BaseMessage } from '@langchain/core/messages';
import { LOCALE } from '@refly-packages/common-types';
import { BaseSkillState } from '../../base';
import { ToolCall } from '@langchain/core/dist/messages/tool';
import { ContentNodeType } from '../../engine';

export interface SkillContextContentItemMetadata {
  domain: ContentNodeType;
  url?: string;
  title: string;
  entityId?: string;
}

export type SelectedContentDomain = 'resourceSelection' | 'canvasSelection' | 'extensionWeblinkSelection';

export interface Chunk {
  content: string;
  metadata: {
    start: number;
    end: number;
  };
}

export interface MentionedContextItem {
  type?: 'canvas' | 'resource' | 'selectedContent';
  entityId?: string;
  url?: string;
  title?: string;
  useWholeContent?: boolean;
}

export interface QueryAnalysis {
  intent: 'WRITING' | 'READING_COMPREHENSION' | 'SEARCH_QA' | 'OTHER';
  confidence: number;
  reasoning: string;
  optimizedQuery: string;
  mentionedContext: IContext;
}

export interface IContext {
  contentList: SkillContextContentItem[];
  resources: SkillContextResourceItem[];
  canvases: SkillContextCanvasItem[];
  projects?: SkillContextProjectItem[];
  messages?: BaseMessage[];
  webSearchSources?: Source[];
  locale?: string | LOCALE;
}

export interface GraphState extends BaseSkillState {
  /**
   * Accumulated messages.
   */
  messages: BaseMessage[];
  /**
   * Skill calls to run.
   */
  skillCalls: ToolCall[];
  contextualUserQuery: string; // 基于上下文改写 userQuery
}

export const enum ChatMode {
  NORMAL_CHAT = 'normal',
  NO_CONTEXT_CHAT = 'noContext',
  WHOLE_SPACE_SEARCH = 'wholeSpace',
}
