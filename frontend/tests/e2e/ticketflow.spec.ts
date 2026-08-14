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
  await expect(page.getByRole("heading", {name: /Sessões cadastradas/})).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
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

test("área do cliente não cria overflow em mobile e tablet", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", {name: /Cliente user1/}).click();
  await expect(page.getByRole("heading", {name: /Escolha seu filme/})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({width: 820, height: 1180});
  await page.reload();
  await expect(page.getByRole("heading", {name: /Escolha seu filme/})).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
