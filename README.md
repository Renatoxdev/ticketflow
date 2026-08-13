# TicketFlow

TicketFlow é uma plataforma de bilheteria online para sessões de cinema. O sistema permite que um organizador publique sessões a partir do catálogo da TMDb, que clientes escolham assentos e simulem pagamento Pix, e que a portaria valide ingressos por QR Code.

## Funcionalidades

- Cadastro e login de usuários.
- Três perfis: organizador, cliente e portaria.
- Busca de filmes na TMDb pelo backend.
- Criação, edição, listagem e cancelamento de sessões pelo organizador.
- Vitrine de sessões em cartaz com pôsteres, data, sala, preço e ocupação.
- Busca e filtros por nome/sala, período e preço máximo.
- Mapa de assentos com corredor central.
- Reserva temporária do assento enquanto o pagamento Pix simulado está pendente.
- Pagamento simulado com aprovação, recusa e nova tentativa.
- Emissão de ingresso somente após pagamento aprovado.
- Área "Meus ingressos" com dados do evento e QR Code.
- Link compartilhável de ingresso por token público seguro.
- Validação na portaria por câmera ou digitação manual.
- Retornos de portaria para ingresso válido, inválido, já utilizado e evento errado.
- Cancelamento de ingresso com devolução do assento ao estoque.
- Proteção no backend e no banco contra venda duplicada e check-in duplicado.

## Stack

- Frontend: React, TypeScript, Vite, qrcode.react e jsQR.
- Backend: Python, FastAPI, SQLAlchemy, Alembic e Pydantic.
- Banco de dados: PostgreSQL.
- Autenticação: JWT.
- Testes: pytest, ruff e Playwright.
- Ambiente local: Docker Compose.

## Estrutura

```text
backend/
  app/
    auth/       autenticação, JWT e permissões
    db/         modelos, sessão do banco e seed
    events/     listagem, filtros e assentos
    external/   integração com TMDb
    gate/       validação de ingresso
    organizer/  área do organizador
    tickets/    pagamento, ingresso e compartilhamento
  alembic/
  tests/

frontend/
  src/
    features/
      customer/
      gate/
      organizer/
    lib/
  tests/e2e/
```

## Como Rodar Localmente

### 1. Configurar variáveis de ambiente

Crie `backend/.env` com base em `backend/.env.example`:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/verzel_events
JWT_SECRET=change-me-in-development
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=60
CORS_ORIGINS=["http://localhost:5173"]
TMDB_API_KEY=sua_chave_da_tmdb
```

Crie `frontend/.env` com base em `frontend/.env.example`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

### 2. Subir a aplicação

```bash
docker compose up --build
```

Serviços locais:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

### 3. Rodar migrations e seed

Em outro terminal:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.db.seed
```

O seed cria usuários de teste e uma sessão publicada com assentos disponíveis.

## Usuários De Teste

| Perfil | Email | Senha |
| --- | --- | --- |
| Organizador | `admin@ticketflow.com` | `admin` |
| Cliente | `user1@ticketflow.com` | `user1` |
| Cliente | `user2@ticketflow.com` | `user2` |
| Portaria | `portaria@ticketflow.com` | `portaria` |

## Fluxos Principais

### Organizador

1. Entrar como organizador.
2. Buscar um filme na TMDb.
3. Conferir título, sinopse e pôster.
4. Definir data, sala, capacidade e preço.
5. Publicar, editar ou cancelar sessões.

### Cliente

1. Entrar como cliente.
2. Navegar pela vitrine de filmes.
3. Filtrar sessões, se necessário.
4. Escolher um assento disponível.
5. Gerar pagamento Pix simulado.
6. Aprovar ou recusar o pagamento.
7. Receber ingresso com QR Code após aprovação.
8. Ver ingressos emitidos em "Meus ingressos".
9. Copiar link compartilhável do ingresso.

### Portaria

1. Entrar como portaria.
2. Selecionar a sessão da entrada.
3. Ler o QR Code pela câmera ou digitar o token.
4. Validar a entrada.
5. Receber retorno claro: válido, inválido, já utilizado ou evento errado.

## Regras Importantes

### Reserva temporária

Ao gerar o pagamento Pix simulado, o assento fica reservado por 15 minutos. Enquanto a cobrança está pendente, outro cliente não consegue escolher o mesmo assento. Se o pagamento for recusado ou expirar, o assento volta a ficar disponível.

### Concorrência

A criação do pagamento e a emissão do ingresso usam transação no PostgreSQL. O backend bloqueia a sessão durante a checagem de disponibilidade e o banco possui índices únicos para impedir duplicidade de assentos confirmados e reservas pendentes.

### Ingresso seguro

O QR Code não usa ID sequencial. Cada ingresso recebe um token público aleatório, gerado no backend. A portaria valida esse token no banco e registra o check-in.

### Validação única

Depois que um ingresso é validado, seu status muda para `USED`. Uma segunda tentativa retorna "já utilizado". O banco também possui constraint única para impedir dois check-ins simultâneos do mesmo ingresso.

## Endpoints Principais

Autenticação:

- `POST /auth/register`
- `POST /auth/login`

Organizador:

- `GET /organizer/external-catalog?q=matrix`
- `GET /organizer/events`
- `POST /organizer/events`
- `PATCH /organizer/events/{event_id}`
- `POST /organizer/events/{event_id}/cancel`

Cliente:

- `GET /events`
- `GET /events/{event_id}/seats`
- `POST /payments/pix`
- `POST /payments/{payment_id}/approve`
- `POST /payments/{payment_id}/fail`
- `GET /customer/tickets`
- `GET /customer/tickets/{ticket_id}/qr`
- `POST /customer/tickets/{ticket_id}/cancel`
- `GET /tickets/share/{token}`

Portaria:

- `POST /gate/check-ins`

## Testes

Backend:

```bash
cd backend
python -m pytest -p no:cacheprovider -q
python -m ruff check app tests
```

Frontend:

```bash
cd frontend
npm install
npm run build
```

E2E com a aplicação local rodando:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

Resultado da última verificação local:

```text
12 passed
All checks passed!
npm run build OK
docker build OK
```

## Deploy

O projeto possui um `Dockerfile` na raiz para publicar frontend e backend em um único serviço. O build gera o frontend com Vite, copia os arquivos finais para o backend FastAPI e serve tudo pelo mesmo domínio.

Variáveis necessárias em produção:

```env
DATABASE_URL=internal_database_url_do_postgres
JWT_SECRET=uma_string_secreta_forte
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=60
CORS_ORIGINS=["https://sua-url.onrender.com"]
TMDB_API_KEY=sua_chave_da_tmdb
```

Comando iniciado pelo container:

```bash
alembic upgrade head && python -m app.db.seed && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

## Limites Da Versão

- O pagamento é simulado; não há transação financeira real.
- Não há integração com PSP real ou sandbox de provedor de pagamento.
- O fluxo usa mapa de assentos; não há modo separado por setor/quantidade.
- O mapa de assentos atualiza automaticamente por consulta periódica, não por WebSocket.
- Quem possui o link compartilhável consegue visualizar o ingresso.
- Não há recuperação de senha, envio de e-mail, nota fiscal, revenda ou aplicativo nativo.
