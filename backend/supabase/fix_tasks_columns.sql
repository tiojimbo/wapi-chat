-- Migração para corrigir as colunas status e priority da tabela clickup_tasks

-- Primeiro, verificar se a tabela clickup_tasks existe
DO $$
BEGIN
    -- Se a tabela não existe, criar com o schema correto
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clickup_tasks') THEN
        CREATE TABLE public.clickup_tasks (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            list_id uuid,
            task_id character varying NOT NULL UNIQUE,
            custom_id character varying,
            name character varying NOT NULL,
            text_content text,
            description text,
            status jsonb DEFAULT '{}'::jsonb,
            orderindex character varying,
            date_created timestamp with time zone,
            date_updated timestamp with time zone,
            date_closed timestamp with time zone,
            date_done timestamp with time zone,
            archived boolean DEFAULT false,
            creator character varying,
            assignees jsonb DEFAULT '[]'::jsonb,
            watchers jsonb DEFAULT '[]'::jsonb,
            checklists jsonb DEFAULT '[]'::jsonb,
            tags jsonb DEFAULT '[]'::jsonb,
            parent character varying,
            priority jsonb DEFAULT '{}'::jsonb,
            due_date timestamp with time zone,
            start_date timestamp with time zone,
            points numeric,
            time_estimate integer,
            time_spent integer DEFAULT 0,
            custom_fields jsonb DEFAULT '{}'::jsonb,
            dependencies jsonb DEFAULT '[]'::jsonb,
            linked_tasks jsonb DEFAULT '[]'::jsonb,
            team_id character varying,
            url text,
            permission_level character varying,
            attachments jsonb DEFAULT '[]'::jsonb,
            created_at timestamp with time zone DEFAULT now(),
            updated_at timestamp with time zone DEFAULT now(),
            CONSTRAINT clickup_tasks_pkey PRIMARY KEY (id),
            CONSTRAINT clickup_tasks_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.clickup_lists(id)
        );
    ELSE
        -- Se a tabela existe, verificar e corrigir as colunas problemáticas
        -- Primeiro, tentar remover as colunas status e priority se existirem
        BEGIN
            ALTER TABLE public.clickup_tasks DROP COLUMN IF EXISTS status CASCADE;
        EXCEPTION WHEN others THEN
            -- Se der erro, ignorar
            NULL;
        END;
        
        BEGIN
            ALTER TABLE public.clickup_tasks DROP COLUMN IF EXISTS priority CASCADE;
        EXCEPTION WHEN others THEN
            -- Se der erro, ignorar
            NULL;
        END;
        
        -- Adicionar as colunas com o tipo correto se não existirem
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clickup_tasks' AND column_name = 'status') THEN
            ALTER TABLE public.clickup_tasks ADD COLUMN status jsonb DEFAULT '{}'::jsonb;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clickup_tasks' AND column_name = 'priority') THEN
            ALTER TABLE public.clickup_tasks ADD COLUMN priority jsonb DEFAULT '{}'::jsonb;
        END IF;
    END IF;
END
$$;