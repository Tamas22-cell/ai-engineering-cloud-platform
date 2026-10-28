from pydantic import BaseModel, Field, field_validator

class UserRegister(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=12, max_length=128)

    @field_validator('email')
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if value.count('@') != 1:
            raise ValueError('Invalid email address')
        local, domain = value.split('@')
        if not local or '.' not in domain:
            raise ValueError('Invalid email address')
        return value

class UserResponse(BaseModel):
    id: str
    email: str
    is_active: bool
    model_config = {'from_attributes': True}
