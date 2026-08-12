# TicketFlow

TicketFlow é uma plataforma de sessões de cinema e ingressos desenvolvida para o Desafio Elite Dev da Verzel.

A aplicação cobre a jornada principal de uma bilheteria online para filmes e séries: criação de sessões a partir de um catálogo externo, vitrine com pôsteres, pagamento simulado, emissão de ingresso com QR Code e validação na portaria.

## Funcionalidades

- Busca de filmes e séries em catálogo externo usando TVMaze.
- Publicação de sessões com título, sinopse, pôster, data, sala, capacidade e preço.
- Vitrine de filmes em cartaz com pôsteres clicáveis.
- Exibição de ocupação da sessão com ingressos vendidos e disponíveis.
- Pagamento simulado antes da emissão do ingresso.
- Emissão de ingresso com token público e QR Code.
- Cópia do código do ingresso para uso na portaria.
- Validação de entrada pela portaria.
- Bloqueio de reutilização de ingresso já usado.
- Proteção contra venda acima da capacidade da sessão.

## Fluxos

```text
Organizador
  busca um filme ou série no TVMaze
  revisa os dados da sessão
  publica a sessão

Cliente
  navega pela vitrine de pôsteres
  escolhe um filme
  simula o pagamento
  recebe o ingresso com QR Code

Portaria
  recebe o código do ingresso
  valida a entrada
  registra o check-in
```

## Stack

- Backend: Python, FastAPI, SQLAlchemy, Alembic e Pydantic.
- Frontend: React, TypeScript e Vite.
- Banco de dados: PostgreSQL.
- Autenticação: JWT.
- Testes: pytest e ruff.
- Ambiente local: Docker Compose.

## Arquitetura

```text
backend/
  app/
    auth/       autenticação, JWT e permissões
    db/         sessão, base e modelos do banco
    events/     sessões publicadas
    external/   integração com TVMaze
    gate/       validação de entrada/check-in
    organizer/  rotas do organizador
    tickets/    checkout, ingresso e QR Code
  tests/
  alembic/

frontend/
  src/
    features/
      organizer/
      customer/
      gate/
    lib/
```

## Regras De Negócio

### Controle de capacidade

A compra de ingresso roda dentro de uma transação no PostgreSQL. A sessão é buscada com lock (`SELECT ... FOR UPDATE`), os ingressos vendidos são contados e o novo ingresso só é criado se ainda houver capacidade disponível.

Essa regra evita overbooking em compras simultâneas.

Arquivos principais:

```text
backend/app/tickets/service.py
backend/tests/test_concurrency_postgres.py
```

### Validação de ingresso

Cada ingresso tem um token público aleatório. Esse token é usado no QR Code apresentado à portaria.

Quando o ingresso é validado, seu status muda de `VALID` para `USED`. O banco também possui uma constraint única para impedir dois check-ins no mesmo ingresso.

Arquivos principais:

```text
backend/app/gate/service.py
backend/tests/test_concurrency_postgres.py
```

### API externa

A integração com TVMaze serve para ajudar o organizador a preencher os dados iniciais da sessão.

Depois da publicação, os dados importantes ficam salvos no banco local. Sessões já publicadas continuam funcionando mesmo se a API externa estiver indisponível.

## Interface

A interface usa a identidade visual do TicketFlow:

- fundo escuro;
- detalhes em bronze e vermelho;
- fonte Limelight nos títulos;
- fonte Poppins para leitura;
- pôsteres grandes na vitrine;
- animações discretas;
- telas separadas para organizador, cliente e portaria.

## Como Rodar

### 1. Subir os containers

```bash
docker compose up --build
```

Serviços:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- PostgreSQL: `localhost:5432`

### 2. Rodar as migrations

Em outro terminal:

```bash
docker compose exec backend alembic upgrade head
```

### 3. Abrir a aplicação

```text
http://localhost:5173
```

A interface possui acessos demo para os três perfis: organizador, cliente e portaria.

## Variáveis De Ambiente

Backend:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/verzel_events
JWT_SECRET=change-me-in-development
JWT_ALGORITHM=HS256
ACCESS_TOKEN_MINUTES=60
CORS_ORIGINS=["http://localhost:5173"]
```

Frontend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Arquivos de exemplo:

```text
backend/.env.example
frontend/.env.example
```

## Testes E Verificação

Backend:

```bash
cd backend
python -m pytest -p no:cacheprovider
python -m ruff check app tests
```

Frontend:

```bash
cd frontend
npm install
npm run build
```

Resultado da última verificação:

```text
8 passed
All checks passed!
npm run build OK
```

## Endpoints Principais

Autenticação:

- `POST /auth/register`
- `POST /auth/login`

Organizador:

- `GET /organizer/external-catalog?q=lost`
- `POST /organizer/events`

Cliente:

- `GET /events`
- `POST /checkout`
- `GET /customer/tickets/{ticket_id}/qr`
- `GET /tickets/share/{token}`

Portaria:

- `POST /gate/check-ins`

## Fora Do Escopo Desta Versão

Não foram implementados:

- pagamento real;
- gateway de pagamento;
- reembolso;
- cupons;
- email;
- notificações;
- marketplace;
- várias moedas;
- carrinho;
- compra de vários ingressos por pedido;
- reserva com tempo de expiração;
- painel administrativo genérico;
- filas;
- Redis;
- microsserviços;
- recuperação de senha.

Essas funcionalidades podem entrar em evoluções futuras. Nesta versão, o foco ficou nos fluxos principais de sessão de cinema, pagamento simulado, emissão de ingresso e validação na portaria.

## Limites

- Cada checkout compra 1 ingresso.
- O pagamento é simulado.
- Quem tem o token consegue apresentar o ingresso.
- A validação do ingresso depende do backend online.
- A interface usa usuários demo para facilitar o teste local.
