from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    log_level: str = "INFO"

    anthropic_api_key: str = ""
    llm_concierge_model: str = "claude-sonnet-4-6"
    llm_triage_model: str = "claude-opus-4-7"

    meta_app_secret: str = ""
    meta_verify_token: str = "change-me"
    meta_page_access_token: str = ""
    meta_graph_api_version: str = "v21.0"

    ghl_client_id: str = ""
    ghl_client_secret: str = ""
    ghl_base_url: str = "https://services.leadconnectorhq.com"

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = Field(default="")


@lru_cache
def get_settings() -> Settings:
    return Settings()
