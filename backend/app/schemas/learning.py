from datetime import datetime
from pydantic import BaseModel, Field

class StudyPromptRead(BaseModel):
    session_id: str
    document_id: str
    topic: str
    prompt: str
    model_config = {"from_attributes": True}

class ExplanationCreate(BaseModel):
    explanation: str = Field(min_length=20, max_length=12000)

class ExplanationFeedback(BaseModel):
    session_id: str
    topic: str
    score: float
    accuracy: float
    quality: float
    difficulty: str
    missing_concepts: list[str]
    misconceptions: list[str]
    strengths: list[str]
    feedback: str
    follow_up_questions: list[str]
    revision_recommendation: str
    created_at: datetime
    model_config = {"from_attributes": True}

class KnowledgeProfile(BaseModel):
    total_explanations: int
    learning_streak: int
    average_score: float
    confidence_trend: list[dict[str, object]]
    strong_topics: list[str]
    weak_topics: list[str]
    misunderstood_concepts: list[str]
    topics_mastered: list[str]
    topics_needing_revision: list[str]
    knowledge_heatmap: list[dict[str, object]]
