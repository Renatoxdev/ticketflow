# TicketFlow

TicketFlow é uma plataforma de bilheteria online para sessões de cinema. O sistema permite que um organizador publique sessões a partir do catálogo da TMDb, que clientes escolham assentos e simulem pagamento Pix, e que a portaria valide ingressos por QR Code.

## Funcionalidades

- Cadastro e login de usuários.
- Sessão persistida no navegador após atualizar a página.
- Login único com redirecionamento automático conforme o perfil do usuário.
- Três perfis: organizador, cliente e portaria.
- Busca de filmes na TMDb pelo backend.
- Criação, edição, listagem, cancelamento, exclusão segura e dashboard de sessões pelo organizador, mantendo as canceladas visíveis no histórico até a exclusão.
- Criação e edição de sessões apenas com data e horário futuros.
- Vitrine de sessões em cartaz com pôsteres, data, sala, preço e ocupação.
- Busca e filtros por nome/sala, período e preço máximo.
- Mapa de assentos com corredor central e seleção de um ou mais lugares.
- Atualização do mapa de assentos por WebSocket, com fallback por consulta periódica.
- Reserva temporária dos assentos enquanto o pagamento Pix simulado está pendente.
- Pagamento simulado com aprovação, recusa e nova tentativa.
- Emissão de ingresso somente após pagamento aprovado.
- Área "Meus ingressos" com dados do evento e QR Code.
- QR Code do ingresso apontando para o link compartilhável.
- Link compartilhável de ingresso por token público seguro.
- Validação na portaria por câmera do dispositivo ou digitação manual.
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

### Pré-requisitos

Para rodar pelo Docker:

- Git.
- Docker.
- Docker Compose.

Para rodar comandos de teste fora dos containers:

- Python 3.12 ou superior.
- Node.js 20 ou superior.
- npm.

### Caminho rápido

Em ambientes com shell compatível com `.sh`, como Git Bash, WSL, Linux ou macOS:

```bash
sh setup-local.sh
```

O script cria os arquivos `.env` quando eles ainda não existem, sobe os containers, roda as migrations e executa o seed.

Se quiser usar a busca real da TMDb, preencha `TMDB_API_KEY` em `backend/.env` antes de rodar o script.

### Passo a passo manual

### 1. Configurar variáveis de ambiente

Crie `backend/.env` com base em `backend/.env.example`:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/verzel_events
JWT_SECRET=change-me-in-development
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=60
CORS_ORIGINS=http://localhost:5173
TMDB_API_KEY=sua_chave_da_tmdb
```

Crie `frontend/.env` com base em `frontend/.env.example`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

### 2. Subir a aplicação

Se estiver usando PowerShell e quiser passar a chave da TMDb para o Docker Compose:

```powershell
$env:TMDB_API_KEY="sua_chave_da_tmdb"
docker compose up --build
```

Em Git Bash, Linux ou macOS:

```bash
export TMDB_API_KEY=sua_chave_da_tmdb
docker compose up --build
```

Serviços locais:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

### 3. Rodar migrations e seed manualmente

Normalmente isso já acontece na inicialização do backend. Se precisar forçar manualmente em outro terminal:

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
6. Acompanhar resumo de sessões, ingressos vendidos e ocupação média.

### Cliente

1. Entrar como cliente.
2. Navegar pela vitrine de filmes.
3. Filtrar sessões, se necessário.
4. Escolher um ou mais assentos disponíveis.
5. Gerar um único pagamento Pix simulado para os assentos escolhidos.
6. Aprovar ou recusar o pagamento.
7. Receber ingresso com QR Code após aprovação.
8. Ver ingressos emitidos em "Meus ingressos".
9. Copiar link compartilhável do ingresso.
10. Abrir o QR Code pela câmera do celular para acessar o ingresso compartilhado.

### Portaria

1. Entrar como portaria.
2. Selecionar a sessão da entrada.
3. Ler o QR Code pela câmera do dispositivo ou digitar o token/link.
4. Validar a entrada.
5. Receber retorno claro: válido, inválido, já utilizado ou evento errado.

## Decisões Técnicas

- **API organizada por domínio:** autenticação, eventos, organização, ingressos e portaria possuem routers, schemas e services próprios. Os routers tratam HTTP e autorização; os services concentram regras e transações; os schemas Pydantic validam o contrato de entrada e saída.
- **PostgreSQL como fonte de verdade:** sessões, reservas, pagamentos, ingressos e check-ins não dependem do estado React. O frontend recarrega esses dados pela API, e índices parciais no banco impedem assentos ativos ou reservas pendentes duplicadas mesmo sob concorrência.
- **Reserva separada do ingresso:** gerar o Pix cria `Payment` e `PaymentSeat` pendentes. O `Ticket` só nasce na aprovação. Isso evita apresentar uma reserva ainda não paga como ingresso confirmado e permite liberar os lugares após recusa ou expiração.
- **Transações e bloqueios pessimistas:** checkout, aprovação/recusa e check-in usam transações e bloqueios de linha nos pontos disputados. Constraints únicas permanecem como última barreira caso duas requisições concorrentes atravessem a aplicação.
- **JWT sem estado no servidor:** a API valida o token e busca o usuário atual antes de autorizar cada perfil. No navegador, a sessão é persistida apenas para evitar novo login; dados de negócio continuam vindo do backend.
- **WebSocket com fallback:** o mapa tenta atualização ao vivo, mas retorna para polling quando o canal não está disponível. A decisão mantém a escolha de assentos utilizável em ambientes que bloqueiam WebSocket.
- **Pagamento deliberadamente simulado:** o projeto demonstra a máquina de estados e a atomicidade do checkout sem fingir integração financeira real. PSP, webhook, estorno financeiro e antifraude estão explicitamente fora desta versão.
- **Trade-off de prazo:** foram priorizados o ciclo completo e suas falhas críticas — persistência, concorrência, idempotência, reload e responsividade — em vez de funcionalidades periféricas como recuperação de senha, email e revenda.

## Regras Importantes

### Reserva temporária

Ao gerar o pagamento Pix simulado, os assentos escolhidos ficam reservados por 15 minutos. Enquanto a cobrança está pendente, outro cliente não consegue escolher os mesmos lugares. Se o pagamento for recusado ou expirar, os assentos voltam a ficar disponíveis.

### Concorrência

A criação do pagamento e a emissão dos ingressos usam transação no PostgreSQL. O backend bloqueia a sessão durante a checagem de disponibilidade e o banco possui índices únicos para impedir duplicidade de assentos confirmados e reservas pendentes.

Quando o cliente escolhe mais de um assento, o sistema gera uma única cobrança Pix simulada. Depois da aprovação, o backend emite um ingresso separado para cada assento comprado.

O mapa de assentos usa WebSocket para manter a tela atualizada enquanto o cliente escolhe o lugar. Se o navegador ou ambiente bloquear o canal, a aplicação volta automaticamente para atualização periódica.

### Ingresso seguro

O QR Code não usa ID sequencial. Cada ingresso recebe um token público aleatório, gerado no backend. O QR Code exibido para o cliente aponta para o link compartilhável do ingresso.

A portaria aceita tanto o token puro quanto o link completo do ingresso. Assim, o QR Code pode ser lido pela câmera dentro da tela de portaria ou pela câmera comum do celular. Ao abrir pela câmera comum, o celular acessa a página compartilhável do ingresso.

Em navegadores mobile, a leitura pela câmera dentro da aplicação depende de HTTPS, que já é o padrão em produção no Render.

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
- `DELETE /organizer/events/{event_id}`

Cliente:

- `GET /events`
- `GET /events/{event_id}/seats`
- `WS /events/{event_id}/seats/ws`
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
python -m ruff check .
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
30 passed
All checks passed!
npm run build OK
Playwright E2E: 10 passed (incluindo fluxo completo, persistência, Home, cancelamento, falha de API, loading, mobile e tablet)
docker compose build OK
migrations em banco PostgreSQL vazio: OK
```

## Deploy

O projeto possui um `Dockerfile` na raiz para publicar frontend e backend em um único serviço. O build gera o frontend com Vite, copia os arquivos finais para o backend FastAPI e serve tudo pelo mesmo domínio.

URL publicada:

- https://ticketflow-1-sszk.onrender.com/

Para o deploy funcionar corretamente, o serviço precisa ter um banco PostgreSQL vinculado, as variáveis de ambiente configuradas e o seed executado na inicialização. O comando do container já roda migrations e seed antes de iniciar a API.

Variáveis necessárias em produção:

```env
DATABASE_URL=internal_database_url_do_postgres
JWT_SECRET=uma_string_secreta_forte
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=60
CORS_ORIGINS=https://sua-url-ativa.onrender.com
TMDB_API_KEY=sua_chave_da_tmdb
```

Comando iniciado pelo container:

```bash
alembic upgrade head && python -m app.db.seed && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

## Uso De IA

Usei o OpenAI Codex como ferramenta de IA para apoiar tarefas concretas, mas revisei manualmente cada alteração e validei os resultados com testes. Ele foi utilizado para decompor o enunciado em fluxos verificáveis, investigar o problema de persistência após reload, revisar regras de concorrência e reserva de assentos, levantar casos extremos do checkout, reconstruir a camada visual e preparar testes automatizados.

A persistência foi confirmada por um teste E2E que cria uma sessão, recarrega a página e procura o mesmo registro retornado pela API. As regras transacionais de capacidade, reserva, emissão e disputa simultânea por assentos foram exercitadas em testes integrados com PostgreSQL. O fluxo de compra, pagamento, emissão e segundo check-in com o mesmo token foi validado pelo Playwright. A área do cliente também foi verificada contra overflow horizontal em viewports de 390 px e 820 px.

As sugestões geradas por IA não foram consideradas corretas apenas porque o código compilava. As alterações foram revisadas no código e verificadas com pytest, Ruff, build TypeScript/Vite, Playwright e construção do container de produção. Sem delegar essas decisões à IA, defini o recorte final do produto, mantive a escolha pelo fluxo de cinema com mapa de assentos, revisei o comportamento entregue e decidi quais sugestões seriam aceitas ou descartadas. As decisões de arquitetura, escopo e aceitação final permaneceram sob minha responsabilidade.

## Limites Da Versão

- O pagamento é simulado; não há transação financeira real.
- Não há integração com PSP real ou sandbox de provedor de pagamento.
- O fluxo usa mapa de assentos; não há modo separado por setor/quantidade.
- O mapa de assentos usa WebSocket com fallback por consulta periódica.
- Quem possui o link compartilhável consegue visualizar o ingresso.
- Não há recuperação de senha, envio de e-mail, nota fiscal, revenda ou aplicativo nativo.
