import {expect, test} from "@playwright/test";

function futureDatetimeLocal() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(20, 0, 0, 0);
  return date.toISOString().slice(0, 16);
}

test.beforeEach(async ({request}) => {
  await expect.poll(async () => {
    const response = await request.get("http://localhost:8000/health");
    return response.ok();
  }).toBe(true);
});

test("cliente compra ingresso e portaria valida o QR Code", async ({page}) => {
  await page.goto("/");

  await page.getByRole("button", {name: /Cliente user1/}).click();
  await expect(page.getByRole("heading", {name: /Escolha seu filme/})).toBeVisible();

  await page.locator(".poster-card").first().click();
  await expect(page.getByText(/Mapa ao vivo|Atualização periódica/)).toBeVisible();
  await page.locator(".seat-button:not(.sold):not(.reserved)").first().click();
  await page.getByRole("button", {name: /Ir para pagamento/}).click();
  await page.getByRole("button", {name: /Confirmar pagamento aprovado/}).click();

  await expect(page.getByText(/Pagamento confirmado/)).toBeVisible();
  await expect(page.getByRole("heading", {name: /Ingressos emitidos/})).toBeVisible();
  const token = await page.locator(".ticket-actions code").first().innerText();

  await page.getByRole("button", {name: "Sair"}).click();
  await page.getByRole("button", {name: /Portaria demo/}).click();

  await page.getByLabel("Código do ingresso").fill(token);
  await page.getByRole("button", {name: /Validar entrada/}).click();
  await expect(page.getByText(/Entrada liberada/)).toBeVisible();

  await page.getByRole("button", {name: /Validar entrada/}).click();
  await expect(page.getByText(/já foi usado/i)).toBeVisible();
});

test("organizador vê dashboard de sessões", async ({page}) => {
  await page.goto("/");

  await page.getByRole("button", {name: /Organizador demo/}).click();

  await expect(page.getByRole("heading", {name: /Sessões cadastradas/})).toBeVisible();
  await expect(page.getByText("Ocupação média")).toBeVisible();
  await expect(page.getByText("Vendidos")).toBeVisible();
});

test("organizador cria sessão e ela permanece após recarregar", async ({page}) => {
  const title = `Sessão E2E ${Date.now()}`;
  await page.route("**/organizer/external-catalog**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          external_source: "e2e",
          external_id: `movie-${Date.now()}`,
          title,
          description: "Filme usado para validar criação e persistência de sessão.",
          image_url: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
          raw_payload: {},
        },
      ]),
    });
  });

  await page.goto("/");

  await page.getByRole("button", {name: /Organizador demo/}).click();
  await page.getByLabel("Buscar filme ou série").fill("Inception");
  await page.getByRole("button", {name: "Buscar"}).click();
  await page.locator(".catalog-item").first().click();
  await page.getByLabel("Quando acontece").fill(futureDatetimeLocal());
  await page.getByLabel("Sala ou cinema").fill(`Sala E2E ${Date.now()}`);
  await page.getByRole("button", {name: /Publicar sessão/}).click();
  await expect(page.getByText(/Sessão publicada/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", {name: /Bilheteria online/})).toBeVisible();
  await page.getByRole("button", {name: /Área do organizador/}).click();
  await expect(page.getByRole("heading", {name: /Sessões cadastradas/})).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
});

test("aplicação abre na Home mesmo com sessão persistida", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: /Cliente user1/}).click();
  await expect(page.getByRole("heading", {name: /Escolha seu filme/})).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", {name: /Bilheteria online/})).toBeVisible();
  await expect(page.locator(".rail-status").getByText("user1@ticketflow.com", {exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: /Área do cliente/})).toBeVisible();
  await expect(page.getByRole("button", {name: /Organizador demo/})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Sair para trocar de conta"})).toBeVisible();
});

test("evento cancelado permanece no histórico do organizador", async ({page}) => {
  const title = `Sessão cancelada E2E ${Date.now()}`;
  await page.route("**/organizer/external-catalog**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([{
        external_source: "e2e",
        external_id: `cancel-${Date.now()}`,
        title,
        description: "Sessão criada para validar o desaparecimento após cancelamento.",
        image_url: null,
        raw_payload: {},
      }]),
    });
  });

  await page.goto("/");
  await page.getByRole("button", {name: /Organizador demo/}).click();
  await page.getByLabel("Buscar filme ou série").fill("cancelar");
  await page.getByRole("button", {name: "Buscar"}).click();
  await page.locator(".catalog-item").first().click();
  await page.getByLabel("Sala ou cinema").fill("Sala cancelamento");
  await page.getByRole("button", {name: /Publicar sessão/}).click();

  const row = page.locator(".management-row").filter({hasText: title});
  await expect(row).toBeVisible();
  await page.route("**/organizer/events/*/cancel", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await row.getByRole("button", {name: "Cancelar"}).click();
  await expect(row.getByRole("button", {name: "Cancelando"})).toBeDisabled();
  await expect(row).toBeVisible();
  await expect(row.getByText("Cancelada", {exact: true})).toBeVisible();
  await expect(row.getByRole("button", {name: "Editar"})).toBeDisabled();
  await expect(row.getByRole("button", {name: "Cancelar"})).toBeDisabled();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", {name: "Excluir"}).click();
  await expect(row).toHaveCount(0);
});

test("pagamento recusado permite nova tentativa", async ({page}) => {
  await page.goto("/");

  await page.getByRole("button", {name: /Cliente user2/}).click();
  await page.locator(".poster-card").first().click();
  await page.locator(".seat-button:not(.sold):not(.reserved)").first().click();
  await page.getByRole("button", {name: /Ir para pagamento/}).click();
  await page.getByRole("button", {name: /Simular pagamento recusado/}).click();

  await expect(page.getByText(/Pagamento recusado/)).toBeVisible();
  await page.getByRole("button", {name: /Tentar pagamento novamente/}).click();
  await expect(page.getByRole("button", {name: /Confirmar pagamento aprovado/})).toBeEnabled();
});

test("carregamento do catálogo oferece feedback visível", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name: /Cliente user1/}).click();
  await expect(page.getByRole("heading", {name: /Em cartaz/})).toBeVisible();

  await page.route("**/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });

  const showcase = page.locator(".customer-showcase");
  await showcase.locator(".filter-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(showcase.getByRole("button", {name: "Filtrando"})).toBeVisible();
});

test("falha ao carregar ingressos não é exibida como lista vazia", async ({page}) => {
  await page.route("**/customer/tickets", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({detail: "Falha simulada ao carregar ingressos."}),
    });
  });

  await page.goto("/");
  await page.getByRole("button", {name: /Cliente user1/}).click();

  await expect(page.getByText("Falha simulada ao carregar ingressos.")).toBeVisible();
  await expect(page.getByText("Nenhum ingresso emitido")).toHaveCount(0);
});

test("portaria sinaliza carregamento inicial das sessões", async ({page}) => {
  await page.route("**/events", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", {name: /Portaria demo/}).click();

  const eventSelect = page.getByLabel("Sessão da entrada");
  await expect(eventSelect).toBeDisabled();
  await expect(eventSelect).toContainText("Carregando sessões...");
  await expect(eventSelect).toBeEnabled();
});

test("área do cliente não cria overflow em mobile e tablet", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", {name: /Cliente user1/}).click();
  await expect(page.getByRole("heading", {name: /Escolha seu filme/})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({width: 820, height: 1180});
  await page.reload();
  await expect(page.getByRole("heading", {name: /Bilheteria online/})).toBeVisible();
  await page.getByRole("button", {name: /Área do cliente/}).click();
  await expect(page.getByRole("heading", {name: /Escolha seu filme/})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
