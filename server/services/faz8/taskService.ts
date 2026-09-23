import crypto from 'crypto';
import { storage } from '../../db/storage';
import { WorkspaceTask, TaskComment, DatabaseState } from '../../db/schema';
import { ActivityAuditService } from './activityAuditService';

export class TaskService {
  /**
   * Yeni görev oluşturur ve atanan kullanıcıya bildirim kaydeder
   */
  public static async createTask(params: {
    tenantId: string;
    title: string;
    description: string;
    assignedToUserId: string;
    assignedToName: string;
    createdByUserId: string;
    createdByName: string;
    priority?: WorkspaceTask['priority'];
    dueDate: string;
    tags?: string[];
  }): Promise<WorkspaceTask> {
    const {
      tenantId,
      title,
      description,
      assignedToUserId,
      assignedToName,
      createdByUserId,
      createdByName,
      priority = 'MEDIUM',
      dueDate,
      tags = [],
    } = params;

    const now = new Date().toISOString();
    const taskId = `task-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    const newTask: WorkspaceTask = {
      id: taskId,
      tenantId,
      title,
      description,
      assignedToUserId,
      assignedToName,
      createdByUserId,
      createdByName,
      priority,
      status: 'NEW',
      dueDate,
      tags,
      commentsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    return await storage.runTransaction((draft: DatabaseState) => {
      if (!draft.workspaceTasks) draft.workspaceTasks = [];
      draft.workspaceTasks.unshift(newTask);

      ActivityAuditService.logActivityDraft(draft, {
        tenantId,
        userId: createdByUserId,
        userName: createdByName,
        actionType: 'CREATE',
        entityType: 'TASK',
        entityId: newTask.id,
        title: `Yeni görev atandı: ${newTask.title} (${assignedToName})`,
      });

      return newTask;
    });
  }

  /**
   * Görev durumunu günceller
   */
  public static async updateTaskStatus(params: {
    tenantId: string;
    taskId: string;
    userId: string;
    userName: string;
    newStatus: WorkspaceTask['status'];
  }): Promise<WorkspaceTask> {
    const { tenantId, taskId, userId, userName, newStatus } = params;

    return await storage.runTransaction((draft: DatabaseState) => {
      const task = (draft.workspaceTasks || []).find(t => t.id === taskId && (t.tenantId === tenantId || (!t.tenantId && tenantId === 'tnt-isbey')));
      if (!task) throw new Error('Görev bulunamadı.');

      const oldStatus = task.status;
      task.status = newStatus;
      task.updatedAt = new Date().toISOString();
      if (newStatus === 'COMPLETED') task.completedAt = task.updatedAt;

      ActivityAuditService.logActivityDraft(draft, {
        tenantId,
        userId,
        userName,
        actionType: 'UPDATE',
        entityType: 'TASK',
        entityId: task.id,
        title: `Görev durumu güncellendi: ${task.title} (${oldStatus} ➔ ${newStatus})`,
      });

      return task;
    });
  }
}
