class AppError(Exception):
    status_code = 400
    message = "Erro ao concluir esta ação."

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message


class ForbiddenError(AppError):
    status_code = 403
    message = "Você não tem permissão para executar esta ação."


class NotFoundError(AppError):
    status_code = 404
    message = "Recurso não encontrado."


class ConflictError(AppError):
    status_code = 409
    message = "Este recurso já existe."


class SoldOutError(AppError):
    status_code = 409
    message = "Todos os ingressos desta sessão já foram vendidos."


class ExternalIntegrationError(AppError):
    status_code = 502
    message = "Erro ao buscar títulos. Tente novamente."


class InvalidTicketError(AppError):
    status_code = 404
    message = "Não encontramos um ingresso válido com esse código."
