from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_session
from ..models import Ingredient
from ..schemas import IngredientCreate, IngredientResponse, IngredientUpdate

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])
DatabaseSession = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[IngredientResponse])
def list_ingredients(session: DatabaseSession) -> list[Ingredient]:
    return list(session.scalars(select(Ingredient).order_by(Ingredient.name)).all())


@router.post("", response_model=IngredientResponse, status_code=status.HTTP_201_CREATED)
def create_ingredient(payload: IngredientCreate, session: DatabaseSession) -> Ingredient:
    ingredient = Ingredient(**payload.model_dump())
    session.add(ingredient)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="ingredient name already exists") from error
    session.refresh(ingredient)
    return ingredient


@router.patch("/{ingredient_id}", response_model=IngredientResponse)
def update_quantity(
    ingredient_id: str,
    payload: IngredientUpdate,
    session: DatabaseSession,
) -> Ingredient:
    ingredient = session.get(Ingredient, ingredient_id)
    if ingredient is None:
        raise HTTPException(status_code=404, detail="ingredient not found")
    ingredient.quantity = payload.quantity
    session.commit()
    session.refresh(ingredient)
    return ingredient
