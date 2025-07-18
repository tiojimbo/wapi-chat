const axios = require('axios');
const SupabaseService = require('../supabase/SupabaseService');
const logger = require('../../utils/logger');

class ClickUpSyncService {
  static async syncAllFromWorkspace(team_id) {
    try {
    logger.info(`[ClickUpSync] Iniciando sincronização para team_id: ${team_id}`);
    const supabase = SupabaseService.getClient();
    
    // Buscar workspace salvo
    const { data: workspace, error: wsError } = await supabase
      .from('clickup_workspaces')
      .select('id, team_id, access_token')
      .eq('team_id', team_id)
      .single();
    
    if (wsError) {
      logger.error(`[ClickUpSync] Erro ao buscar workspace:`, wsError);
      throw new Error(`Erro ao buscar workspace: ${wsError.message}`);
    }
    
    if (!workspace) {
      logger.error(`[ClickUpSync] Workspace não encontrado para team_id: ${team_id}`);
      throw new Error('Workspace não encontrado');
    }
    
    const access_token = workspace.access_token;
    const workspace_uuid = workspace.id;
    logger.info(`[ClickUpSync] Workspace encontrado: UUID=${workspace_uuid}, team_id=${team_id}`);

    // 1. SPACES
    const spacesRes = await axios.get(`https://api.clickup.com/api/v2/team/${team_id}/space`, {
      headers: { Authorization: access_token }
    });
    const spaces = spacesRes.data.spaces || [];
    logger.info(`[ClickUpSync] Spaces encontrados: ${spaces.length}`);
    for (const space of spaces) {
      const upsertSpace = {
        space_id: space.id,
        workspace_id: workspace_uuid,
        name: space.name,
        color: space.color,
        private: space.private,
        avatar: space.avatar,
        admin_can_manage: space.admin_can_manage,
        multiple_assignees: space.multiple_assignees,
        features: space.features,
        archived: space.archived,
        created_at: space.date_created ? new Date(Number(space.date_created)) : null,
        updated_at: new Date().toISOString()
      };
      const { data: spaceData, error: spaceError } = await supabase.from('clickup_spaces').upsert(upsertSpace, { onConflict: ['space_id'], ignoreDuplicates: false }).select('id');
      logger.info(`[ClickUpSync] Upsert space:`, { upsertSpace, spaceData, spaceError });
      if (spaceError) {
        logger.error(`[ClickUpSync] Erro ao inserir space ${space.id}:`, spaceError);
        continue;
      }
      const spaceUuid = spaceData?.[0]?.id;

      // 2. FOLDERS
      const foldersRes = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/folder`, {
        headers: { Authorization: access_token }
      });
      const folders = foldersRes.data.folders || [];
      logger.info(`[ClickUpSync] Folders encontrados para space ${space.id}: ${folders.length}`);
      for (const folder of folders) {
        const upsertFolder = {
          folder_id: folder.id,
          space_id: spaceUuid,
          name: folder.name,
          orderindex: folder.orderindex,
          override_statuses: folder.override_statuses,
          hidden: folder.hidden,
          task_count: folder.task_count,
          lists: folder.lists,
          created_at: folder.date_created ? new Date(Number(folder.date_created)) : null,
          updated_at: new Date().toISOString()
        };
        const { data: folderData, error: folderError } = await supabase.from('clickup_folders').upsert(upsertFolder, { onConflict: ['folder_id'], ignoreDuplicates: false }).select('id');
        logger.info(`[ClickUpSync] Upsert folder:`, { upsertFolder, folderData, folderError });
        if (folderError) {
          logger.error(`[ClickUpSync] Erro ao inserir folder ${folder.id}:`, folderError);
          continue;
        }
        const folderUuid = folderData?.[0]?.id;

        // 3. LISTS
        logger.info(`[ClickUpSync] Lists encontrados para folder ${folder.id}: ${(folder.lists || []).length}`);
        for (const list of folder.lists || []) {
          const upsertList = {
            list_id: list.id,
            folder_id: folderUuid,
            space_id: spaceUuid,
            name: list.name,
            orderindex: list.orderindex,
            status: list.status,
            priority: list.priority,
            assignee: list.assignee,
            due_date_time: list.due_date_time,
            start_date_time: list.start_date_time,
            archived: list.archived,
            override_statuses: list.override_statuses,
            permission_level: list.permission_level,
            created_at: list.date_created ? new Date(Number(list.date_created)) : null,
            updated_at: new Date().toISOString()
          };
          const { data: listData, error: listError } = await supabase.from('clickup_lists').upsert(upsertList, { onConflict: ['list_id'], ignoreDuplicates: false }).select('id');
          logger.info(`[ClickUpSync] Upsert list:`, { upsertList, listData, listError });
          if (listError) {
            logger.error(`[ClickUpSync] Erro ao inserir list ${list.id}:`, listError);
            continue;
          }
          const listUuid = listData?.[0]?.id;

          // 4. TASKS
          const tasksRes = await axios.get(`https://api.clickup.com/api/v2/list/${list.id}/task`, {
            headers: { Authorization: access_token }
          });
          const tasks = tasksRes.data.tasks || [];
          logger.info(`[ClickUpSync] Tasks encontrados para list ${list.id}: ${tasks.length}`);
          for (const task of tasks) {
            const upsertTask = {
              task_id: task.id,
              list_id: listUuid,
              custom_id: task.custom_id,
              name: task.name,
              text_content: task.text_content,
              description: task.description,
              status: task.status ? JSON.stringify(task.status) : null,
              orderindex: task.orderindex,
              date_created: task.date_created ? new Date(Number(task.date_created)) : null,
              date_updated: task.date_updated ? new Date(Number(task.date_updated)) : null,
              date_closed: task.date_closed ? new Date(Number(task.date_closed)) : null,
              date_done: task.date_done ? new Date(Number(task.date_done)) : null,
              archived: task.archived,
              creator: task.creator ? JSON.stringify(task.creator) : null,
              assignees: task.assignees,
              watchers: task.watchers,
              checklists: task.checklists,
              tags: task.tags,
              parent: task.parent,
              priority: task.priority ? JSON.stringify(task.priority) : null,
              due_date: task.due_date ? new Date(Number(task.due_date)) : null,
              start_date: task.start_date ? new Date(Number(task.start_date)) : null,
              points: task.points,
              time_estimate: task.time_estimate,
              time_spent: task.time_spent,
              custom_fields: task.custom_fields,
              dependencies: task.dependencies,
              linked_tasks: task.linked_tasks,
              team_id: team_id,
              url: task.url,
              permission_level: task.permission_level,
              attachments: task.attachments,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            const { data: taskData, error: taskError } = await supabase.from('clickup_tasks').upsert(upsertTask, { onConflict: ['task_id'], ignoreDuplicates: false });
            logger.info(`[ClickUpSync] Upsert task:`, { upsertTask, taskData, taskError });
            if (taskError) {
              logger.error(`[ClickUpSync] Erro ao inserir task ${task.id}:`, taskError);
            }
          }
        }
      }
    }
    logger.info(`[ClickUpSync] Sincronização concluída com sucesso para team_id: ${team_id}`);
    return { success: true, message: 'Sincronização concluída com sucesso' };
    } catch (error) {
      logger.error(`[ClickUpSync] Erro durante a sincronização:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ClickUpSyncService; 