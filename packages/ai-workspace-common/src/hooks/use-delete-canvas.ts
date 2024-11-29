import { useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import { useDebouncedCallback } from 'use-debounce';
import { useNavigate } from 'react-router-dom';
import { useHandleSiderData } from '@refly-packages/ai-workspace-common/hooks/use-handle-sider-data';

export const useDeleteCanvas = () => {
  const [isRemoving, setIsRemoving] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getCanvasList, canvasList } = useHandleSiderData();

  const deleteCanvas = async (canvasId: string) => {
    if (isRemoving) return;
    let success = false;
    try {
      setIsRemoving(true);
      const { data } = await getClient().deleteCanvas({
        body: {
          canvasId,
        },
      });

      if (data?.success) {
        success = true;
        message.success(t('common.putSuccess'));

        // Check and remove canvasId from localStorage if matches
        const storedCanvasId = localStorage.getItem('currentCanvasId');
        if (storedCanvasId === canvasId) {
          localStorage.removeItem('currentCanvasId');
        }

        getCanvasList();

        if (storedCanvasId === canvasId) {
          const firstCanvas = canvasList?.find((canvas) => canvas.id !== canvasId);
          if (firstCanvas?.id) {
            navigate(`/canvas/${firstCanvas?.id}`);
          } else {
            navigate('/canvas/empty');
          }
        }
      }
    } finally {
      setIsRemoving(false);
    }
    return success;
  };

  const debouncedDeleteCanvas = useDebouncedCallback(
    (canvasId: string) => {
      return deleteCanvas(canvasId);
    },
    300,
    { leading: true },
  );

  return { deleteCanvas: debouncedDeleteCanvas, isRemoving };
};
