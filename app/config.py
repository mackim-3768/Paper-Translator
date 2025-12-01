from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "dev"
    redis_url: str = "redis://redis:6379/0"
    llm_model: str = "gpt-4.1-mini"

    model_config = SettingsConfigDict(
        env_prefix="APP_",
        case_sensitive=False,
    )


settings = Settings()
