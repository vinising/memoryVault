from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field

class BucketEnum(str, Enum):
    GOAL = "GOAL"
    NOTE = "NOTE"
    TASK = "TASK"
    ISSUE = "ISSUE"

    @classmethod
    def _missing_(cls, value):
        if not isinstance(value, str):
            return None
        val = value.upper()
        if val == "EPIC": return cls.GOAL
        if val == "US": return cls.NOTE
        if val == "TT": return cls.TASK
        if val == "PT": return cls.ISSUE
        return cls.TASK

class BucketModel(BaseModel):
    name: str = Field(..., min_length=1, description="Unique bucket name")
    color: str = Field(..., description="Tailwind color class/identifier")
    template: Optional[str] = Field(default=None, description="Markdown baseline template structure")
    is_custom: Optional[bool] = Field(default=False, description="Whether it is user defined")

class Attachment(BaseModel):
    id: str = Field(..., description="Unique ID for attachment")
    filename: str = Field(..., description="Original name of the file")
    url: str = Field(..., description="Static download/view URL")
    mime_type: str = Field(..., description="MIME type e.g. image/png")
    size: int = Field(..., description="File size in bytes")

class NewEntry(BaseModel):
    bucket: Optional[str] = Field(default="TASK", description="Category of entry")
    title: str = Field(..., min_length=1, description="One-line summary")
    tags: Optional[str] = Field(default="", description="Comma-separated tags")
    description: Optional[str] = Field(default="", description="Deep detailed description")
    attachments: Optional[List[Attachment]] = Field(default_factory=list, description="List of file attachments")

class Entry(BaseModel):
    id: str = Field(..., description="Sequential ID string e.g. #0001")
    bucket: Optional[str] = Field(default="TASK", description="Category of entry")
    title: str = Field(..., min_length=1, description="One-line summary")
    tags: Optional[str] = Field(default="", description="Comma-separated tags")
    description: Optional[str] = Field(default="", description="Deep detailed description")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    status: str = Field(default="open", description="Can be open, in-progress, done, archived")
    attachments: Optional[List[Attachment]] = Field(default_factory=list, description="List of file attachments")

class PartialEntry(BaseModel):
    bucket: Optional[str] = None
    title: Optional[str] = None
    tags: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    attachments: Optional[List[Attachment]] = None

# Local LLM Trace Model Schema
class LLMTrace(BaseModel):
    prompt: str
    response: str
    model_used: str
    latency_ms: int
    status: str
    timestamp: Optional[str] = None
