import {expect, test} from "@playwright/test";

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
  await page.getByRole("navigation").getByRole("button", {name: "Portaria"}).click();
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
