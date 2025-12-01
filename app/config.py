from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "dev"
    redis_url: str = "redis://redis:6379/0"

    model_config = SettingsConfigDict(
        env_prefix="APP_",
        case_sensitive=False,
    )


settings = Settings()
