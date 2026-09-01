"""
Pydantic v2 schemas for the Legal Aid Workflow CRM.

Defines request/response models for profiles, cases, defendants,
documents, agent outputs, complaints, messages, and notifications.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

class ProfileBase(BaseModel):
    """Shared fields for user profiles."""
    role: str = Field(..., description="User role: 'client' or 'attorney'")
    full_name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    address: Optional[str] = None
    county: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=2, description="Two-letter state code")
    firm_name: Optional[str] = Field(None, max_length=300)
    bar_number: Optional[str] = Field(None, max_length=50)


class ProfileCreate(ProfileBase):
    """Payload for creating a new profile (id comes from Supabase Auth)."""
    id: UUID = Field(..., description="Auth user UUID from Supabase Auth")


class ProfileResponse(ProfileBase):
    """Full profile returned to callers."""
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Defendant
# ---------------------------------------------------------------------------

class DefendantBase(BaseModel):
    """Shared defendant fields."""
    name: str = Field(..., min_length=1, max_length=300)
    principal_address: Optional[str] = None
    ga_registered_agent: Optional[str] = Field(
        None, max_length=300, description="Georgia registered agent name"
    )
    entity_type: Optional[str] = Field(
        None, max_length=100, description="e.g. Corporation, LLC, Individual"
    )


class DefendantCreate(DefendantBase):
    """Payload for creating a defendant."""
    is_custom: bool = Field(
        False, description="True if the defendant was added by a client (not pre-seeded)"
    )


class DefendantResponse(DefendantBase):
    """Defendant record returned to callers."""
    id: UUID
    is_custom: bool

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Case
# ---------------------------------------------------------------------------

class CaseBase(BaseModel):
    """Fields common to case creation and response."""
    case_facts: str = Field(..., min_length=1, description="Client narrative of the case facts")
    damages_description: str = Field(
        ..., min_length=1, description="Description of damages suffered"
    )


class CaseCreate(CaseBase):
    """Payload submitted by a client to open a new case."""
    defendant_ids: list[UUID] = Field(
        ..., min_length=1, description="One or more defendant UUIDs"
    )


class CaseResponse(CaseBase):
    """Full case record returned to callers."""
    id: UUID
    client_id: UUID
    status: str = Field(
        ...,
        description=(
            "Workflow status: submitted, processing, review, "
            "revision_requested, approved, denied"
        ),
    )
    court: Optional[str] = None
    jury_demand: Optional[bool] = None
    statutes_identified: Optional[list[str]] = None
    denial_reason: Optional[str] = None
    revision_notes: Optional[str] = None
    revision_count: int = 0
    defendant_ids: Optional[list[UUID]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CaseStatusUpdate(BaseModel):
    """Payload for updating a case's status."""
    status: str = Field(
        ...,
        description=(
            "New status value: submitted, processing, review, "
            "revision_requested, approved, denied"
        ),
    )
    rejection_reason: Optional[str] = Field(
        None,
        max_length=5000,
        description="Required when moving a case into a rejected status.",
    )


# ---------------------------------------------------------------------------
# Case review actions
# ---------------------------------------------------------------------------

class RevisionRequest(BaseModel):
    """Attorney requests revisions on a case."""
    notes: str = Field(..., min_length=1, description="Revision instructions for the client")


class DenialRequest(BaseModel):
    """Attorney denies a case."""
    reason: str = Field(..., min_length=1, description="Reason the case was denied")


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------

class DocumentResponse(BaseModel):
    """Metadata for an uploaded document."""
    id: UUID
    case_id: UUID
    file_name: str
    file_type: str
    file_size: int = Field(..., description="File size in bytes")
    storage_path: str
    document_category: Optional[str] = Field(
        None, description="e.g. evidence, medical_record, correspondence"
    )
    uploaded_by: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Agent output
# ---------------------------------------------------------------------------

class AgentOutputResponse(BaseModel):
    """Result of an AI agent run against a case."""
    id: UUID
    case_id: UUID
    agent_name: str
    status: str = Field(..., description="pending, running, completed, failed")
    input_data: Optional[dict] = None
    output_data: Optional[dict] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Complaint
# ---------------------------------------------------------------------------

class ComplaintResponse(BaseModel):
    """Generated legal complaint document."""
    id: UUID
    case_id: UUID
    complaint_text: Optional[str] = None
    complaint_docx_url: Optional[str] = None
    strategy_memo_url: Optional[str] = None
    version: int = 1
    approved_by: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    is_current: bool = True

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Message
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    """Payload for sending a message on a case thread."""
    body: str = Field(..., min_length=1, description="Message text")


class MessageResponse(BaseModel):
    """A single message in a case conversation."""
    id: UUID
    case_id: UUID
    sender_id: UUID
    body: str
    read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Notification
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    """User notification record."""
    id: UUID
    user_id: UUID
    type: str = Field(..., description="Notification type key")
    message: str
    case_id: Optional[UUID] = None
    read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Pipeline status (lightweight view of agent progress)
# ---------------------------------------------------------------------------

class PipelineStatusResponse(BaseModel):
    """Status of a single agent within the processing pipeline."""
    agent_name: str
    status: str = Field(..., description="pending, running, completed, failed")
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
