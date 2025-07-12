# WapiChat - Sistema de WhatsApp Multi-Atendimento com IA

Sistema completo de gerenciamento de WhatsApp Business com inteligência artificial, desenvolvido com Node.js, Baileys, Supabase e Next.js.

## 🚀 Características

- **Multi-sessões WhatsApp**: Gerencie múltiplos números WhatsApp simultaneamente
- **IA Integrada**: Análise de sentimento e detecção de intenções com OpenAI
- **Interface Moderna**: Frontend responsivo com Next.js 14 e Tailwind CSS
- **Banco de Dados**: Supabase PostgreSQL com autenticação integrada
- **Tempo Real**: Comunicação em tempo real com Socket.io
- **Gestão de Contatos**: Sistema completo de CRM integrado
- **Templates**: Sistema de templates de mensagem com variáveis
- **Analytics**: Dashboard com métricas e relatórios

## 🛠️ Stack Tecnológica

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **WhatsApp**: Baileys 6.7.18 (@whiskeysockets/baileys)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Real-time**: Socket.io
- **IA**: OpenAI API (GPT-3.5-turbo)

### Frontend
- **Framework**: Next.js 14 + React 18
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui + Magic UI
- **Icons**: Lucide React
- **State Management**: Zustand
- **Real-time**: Socket.io Client

## 📦 Instalação

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Conta no Supabase
- Chave da API OpenAI

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/wapi-chat.git
cd wapi-chat
```

### 2. Instale as dependências
```bash
# Instalar dependências do projeto principal
npm install

# Instalar dependências do backend
cd backend && npm install

# Instalar dependências do frontend
cd ../frontend && npm install
```

### 3. Configure as variáveis de ambiente

#### Backend (.env)
```bash
cd backend
cp env.example .env
```

Edite o arquivo `.env` com suas configurações:
```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=sua_url_do_supabase
SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_do_supabase

# OpenAI Configuration
OPENAI_API_KEY=sua_chave_da_openai

# WhatsApp Configuration
WHATSAPP_SESSION_PATH=./sessions

# Security
JWT_SECRET=seu_jwt_secret
SESSION_SECRET=seu_session_secret
```

#### Frontend (.env.local)
```bash
cd frontend
cp .env.example .env.local
```

Edite o arquivo `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### 4. Configure o Supabase

1. Acesse o [Supabase Dashboard](https://supabase.com)
2. Crie um novo projeto
3. Execute o schema SQL em `backend/supabase/schema.sql`
4. Configure as políticas de RLS conforme necessário

### 5. Execute o projeto

#### Desenvolvimento
```bash
# Na raiz do projeto
npm run dev
```

Isso iniciará:
- Backend na porta 3001
- Frontend na porta 3000

#### Produção
```bash
# Build do projeto
npm run build

# Iniciar produção
npm start
```

## 📱 Uso

### 1. Acesse o sistema
Abra `http://localhost:3000` no seu navegador

### 2. Crie uma conta
- Registre-se com email e senha
- Crie ou entre em uma organização

### 3. Configure uma sessão WhatsApp
- Clique em "Nova Sessão"
- Escaneie o QR Code com seu WhatsApp
- Aguarde a conexão

### 4. Comece a usar
- Visualize conversas em tempo real
- Envie mensagens e mídias
- Use templates e respostas rápidas
- Monitore métricas e análises

## 🔧 Estrutura do Projeto

```
wapi-chat/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── services/
│   │   │   ├── baileys/
│   │   │   │   └── WhatsAppManager.js
│   │   │   ├── supabase/
│   │   │   └── openai/
│   │   ├── routes/
│   │   │   ├── whatsapp.js
│   │   │   └── auth.js
│   │   ├── utils/
│   │   │   └── logger.js
│   │   └── index.js
│   ├── sessions/
│   ├── logs/
│   ├── supabase/
│   │   └── schema.sql
│   └── package.json
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── public/
├── package.json
└── README.md
```

## 🚀 Deploy

### Backend (Render.com)
1. Conecte seu repositório ao Render
2. Configure as variáveis de ambiente
3. Deploy automático

### Frontend (Vercel)
1. Conecte seu repositório ao Vercel
2. Configure as variáveis de ambiente
3. Deploy automático


## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🆘 Suporte

- **Documentação**: [Wiki do Projeto](link-para-wiki)
- **Issues**: [GitHub Issues](link-para-issues)
- **Email**: suporte@wapichat.com

## 🙏 Agradecimentos

- [Baileys](https://github.com/whiskeysockets/baileys) - Biblioteca WhatsApp
- [Supabase](https://supabase.com) - Backend as a Service
- [OpenAI](https://openai.com) - Inteligência Artificial
- [Next.js](https://nextjs.org) - Framework React
- [Tailwind CSS](https://tailwindcss.com) - Framework CSS

---

**WapiChat** - Transformando a comunicação empresarial com WhatsApp e IA 🤖📱 
