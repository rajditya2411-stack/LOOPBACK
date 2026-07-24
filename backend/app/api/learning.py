"""Active-recall study and persistent knowledge-profile endpoints."""
import json
from collections import Counter
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.document import Document, DocumentChunk
from app.models.settings import UserSettings
from app.models.learning import LearningSession
from app.models.user import User
from app.schemas.learning import StudyPromptRead, ExplanationCreate, ExplanationFeedback, KnowledgeProfile
from app.services.ai_provider import ProviderConfig, ProviderManager, AIProviderError

router = APIRouter(prefix="/learning", tags=["Learning"])

def _json(value: str | None) -> list[str]:
    try:
        result = json.loads(value or "[]")
        return [str(item) for item in result] if isinstance(result, list) else []
    except json.JSONDecodeError:
        return []

async def _owned_session(db: AsyncSession, user_id: str, session_id: str) -> LearningSession:
    session = await db.scalar(select(LearningSession).where(LearningSession.id == session_id, LearningSession.user_id == user_id))
    if session is None: raise HTTPException(status_code=404, detail="Study session not found")
    return {"session_id": session.id, "document_id": session.document_id, "topic": session.topic, "prompt": session.prompt}

@router.post("/documents/{document_id}/study", response_model=StudyPromptRead)
async def start_study(document_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> LearningSession:
    document = await db.scalar(select(Document).where(Document.id == document_id, Document.user_id == current_user.id))
    if document is None: raise HTTPException(status_code=404, detail="Document not found")
    chunks = list((await db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document_id).order_by(DocumentChunk.chunk_index).limit(6))).all())
    if not chunks: raise HTTPException(status_code=409, detail="Document is not ready for study")
    topic = document.title.rsplit(".", 1)[0]
    prompt = f"Explain {topic} in your own words without looking back at the document. Cover the main idea, key concepts, and one practical example. This is active recall: try from memory first."
    session = LearningSession(user_id=current_user.id, document_id=document_id, topic=topic, prompt=prompt)
    db.add(session); await db.commit(); await db.refresh(session)
    return {"session_id": session.id, "topic": session.topic, "score": session.score, "accuracy": session.accuracy, "quality": session.quality, "difficulty": session.difficulty or "moderate", "missing_concepts": _json(session.missing_concepts), "misconceptions": _json(session.misconceptions), "strengths": _json(session.strengths), "feedback": session.feedback or "", "follow_up_questions": _json(session.follow_up_questions), "revision_recommendation": session.revision_recommendation or "", "created_at": session.created_at}

@router.post("/sessions/{session_id}/explanation", response_model=ExplanationFeedback)
async def evaluate_explanation(session_id: str, data: ExplanationCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> LearningSession:
    session = await _owned_session(db, current_user.id, session_id)
    chunks = list((await db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == session.document_id).order_by(DocumentChunk.chunk_index).limit(8))).all())
    user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == current_user.id))
    if not user_settings or not user_settings.ai_api_key: raise HTTPException(status_code=503, detail="Configure your AI provider before evaluating an explanation.")
    evidence = "\n\n".join(chunk.content for chunk in chunks)
    instruction = """Evaluate the learner's explanation against the source. Return ONLY valid JSON with keys: score, accuracy, quality (0-100 numbers), difficulty (easy|moderate|hard), missing_concepts (array), misconceptions (array), strengths (array), feedback (string), follow_up_questions (array), revision_recommendation (string). Be educational and specific; never reply only 'correct'. Encourage active recall."""
    messages = [{"role":"system", "content": instruction}, {"role":"user", "content": f"TOPIC: {session.topic}\nSOURCE:\n{evidence}\n\nLEARNER EXPLANATION:\n{data.explanation}"}]
    try:
        raw = await ProviderManager(ProviderConfig(provider=user_settings.ai_provider, api_key=user_settings.ai_api_key, model=user_settings.ai_model, temperature=float(user_settings.ai_temperature))).complete_text(messages)
        parsed = json.loads(raw[raw.find("{"):raw.rfind("}") + 1])
    except (AIProviderError, ValueError, json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"The selected AI provider could not evaluate this explanation: {str(exc)[:180]}") from exc
    session.explanation = data.explanation
    for field in ("score", "accuracy", "quality", "difficulty", "feedback", "revision_recommendation"):
        setattr(session, field, parsed.get(field))
    for field in ("missing_concepts", "misconceptions", "strengths", "follow_up_questions"):
        setattr(session, field, json.dumps(parsed.get(field, [])))
    await db.commit(); await db.refresh(session)
    return session

@router.get("/profile", response_model=KnowledgeProfile)
async def get_knowledge_profile(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> KnowledgeProfile:
    sessions = list((await db.scalars(select(LearningSession).where(LearningSession.user_id == current_user.id, LearningSession.score.is_not(None)).order_by(LearningSession.created_at))).all())
    by_topic: dict[str, list[float]] = {}
    concepts: Counter[str] = Counter()
    for item in sessions:
        by_topic.setdefault(item.topic, []).append(float(item.score or 0)); concepts.update(_json(item.misconceptions))
    averages = {topic: round(sum(values) / len(values), 1) for topic, values in by_topic.items()}
    strong = sorted((topic for topic, score in averages.items() if score >= 80))
    weak = sorted((topic for topic, score in averages.items() if score < 70))
    days = {item.created_at.date() for item in sessions if item.created_at}
    streak = 0; cursor = date.today()
    while cursor in days: streak += 1; cursor -= timedelta(days=1)
    trend = [{"date": item.created_at.isoformat(), "score": round(float(item.score or 0), 1), "topic": item.topic} for item in sessions[-30:]]
    heatmap = [{"topic": topic, "score": score, "attempts": len(by_topic[topic])} for topic, score in sorted(averages.items())]
    return KnowledgeProfile(total_explanations=len(sessions), learning_streak=streak, average_score=round(sum(float(s.score or 0) for s in sessions) / len(sessions), 1) if sessions else 0, confidence_trend=trend, strong_topics=strong, weak_topics=weak, misunderstood_concepts=[item for item, _ in concepts.most_common(10)], topics_mastered=strong, topics_needing_revision=weak, knowledge_heatmap=heatmap)
