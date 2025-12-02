from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "dev"
    rabbitmq_url: str = "amqp://guest:guest@rabbitmq:5672//"
    db_url: str = "postgresql://paper:paper@postgres:5432/paper"
    llm_model: str = "gpt-4.1-mini"
    data_dir: str = "/data"
    storage_backend: str = "local"
    job_ttl_days: int = 7

    model_config = SettingsConfigDict(
        env_prefix="APP_",
        case_sensitive=False,
    )


settings = Settings()
