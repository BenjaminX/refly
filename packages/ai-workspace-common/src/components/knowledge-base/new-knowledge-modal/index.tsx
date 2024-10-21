import { Modal, Form, Input, Message } from '@arco-design/web-react';
import { useState, useEffect } from 'react';
import { useImportKnowledgeModal } from '@refly-packages/ai-workspace-common/stores/import-knowledge-modal';
import { useReloadListState } from '@refly-packages/ai-workspace-common/stores/reload-list-state';

// 请求
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';

import { useTranslation } from 'react-i18next';

const FormItem = Form.Item;
const TextArea = Input.TextArea;

export const NewKnowledgeModal = () => {
  const { t } = useTranslation();
  const reloadListState = useReloadListState();
  const importKnowledgeModal = useImportKnowledgeModal();
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [form] = Form.useForm();
  const editProject = importKnowledgeModal.editProject;

  function onOk() {
    form
      .validate()
      .then(async (res) => {
        console.log(res);
        setConfirmLoading(true);
        let result = null;
        try {
          if (editProject) {
            const reqBody = { ...editProject, ...res };
            delete reqBody.resources;
            result = await getClient().updateProject({
              body: reqBody,
            });
          } else {
            result = await getClient().createProject({
              body: res,
            });
          }
          setConfirmLoading(false);
          if (result?.error) {
            Message.error(t(`workspace.newKnowledgeModal.${editProject ? 'editFailed' : 'failed'}`));
          } else {
            importKnowledgeModal.setShowNewKnowledgeModal(false);
            Message.success(t(`workspace.newKnowledgeModal.${editProject ? 'editSuccessful' : 'successful'}`));
            reloadListState.setReloadKnowledgeBaseList(true);
          }
        } catch (error) {
          Message.error(t(`workspace.newKnowledgeModal.${editProject ? 'editFailed' : 'failed'}`));
          setConfirmLoading(false);
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }

  const formItemLayout = {
    labelCol: {
      span: 4,
    },
    wrapperCol: {
      span: 20,
    },
  };

  useEffect(() => {
    if (importKnowledgeModal.showNewKnowledgeModal && editProject) {
      const { title, description } = editProject;
      form.setFieldsValue({ title, description });
    }
  }, [importKnowledgeModal.showNewKnowledgeModal]);

  return (
    <div>
      <Modal
        title={t(`workspace.newKnowledgeModal.${editProject ? 'editModalTitle' : 'modalTitle'}`)}
        visible={importKnowledgeModal.showNewKnowledgeModal}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onOk={onOk}
        confirmLoading={confirmLoading}
        onCancel={() => importKnowledgeModal.setShowNewKnowledgeModal(false)}
      >
        <Form
          {...formItemLayout}
          form={form}
          labelCol={{
            style: { flexBasis: 90 },
          }}
          wrapperCol={{
            style: { flexBasis: 'calc(100% - 90px)' },
          }}
        >
          <FormItem
            label={t('workspace.newKnowledgeModal.title')}
            field="title"
            rules={[{ required: true, message: t('workspace.newKnowledgeModal.titlePlaceholder') }]}
          >
            <Input maxLength={100} showWordLimit placeholder={t('workspace.newKnowledgeModal.titlePlaceholder')} />
          </FormItem>
          <FormItem label={t('workspace.newKnowledgeModal.description')} field="description">
            <TextArea
              placeholder={t('workspace.newKnowledgeModal.descriptionPlaceholder')}
              maxLength={500}
              showWordLimit
            />
          </FormItem>
        </Form>
      </Modal>
    </div>
  );
};
