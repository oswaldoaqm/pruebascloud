"""Tests unitarios de seed_data (consistencia del catálogo y sedes)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import seed_data

CATEGORIAS_VALIDAS = {"pizzas", "complementos", "bebidas", "postres"}


def test_hay_4_sedes_y_central():
    assert len(seed_data.SEDES) == 4
    assert len(seed_data.TENANTS) == 4
    assert seed_data.CENTRAL not in seed_data.TENANTS  # central no es una sede de venta


def test_sedes_tienen_campos():
    for s in seed_data.SEDES:
        assert s["id"] and s["nombre"] and s["direccion"]


def test_product_ids_unicos():
    ids = [p["id"] for p in seed_data.PRODUCTOS]
    assert len(ids) == len(set(ids))            # sin duplicados


def test_productos_validos():
    for p in seed_data.PRODUCTOS:
        assert p["categoria"] in CATEGORIAS_VALIDAS
        assert p["precio"] > 0
        assert p["nombre"] and p["image_key"]
