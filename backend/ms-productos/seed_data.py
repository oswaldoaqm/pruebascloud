"""Catálogo Papa Johns Perú (referencia: papajohns.com.pe). Precios aprox. en soles.
image_key = nombre del archivo que debes subir al bucket S3 (aws s3 cp ...).
"""

PRODUCTOS = [
    # Pizzas
    {"id": "pz-pepperoni", "nombre": "Pepperoni", "categoria": "pizzas", "precio": 39.90,
     "descripcion": "Doble porción de pepperoni y queso mozzarella", "image_key": "pizzas/pepperoni.jpg"},
    {"id": "pz-americana", "nombre": "Americana", "categoria": "pizzas", "precio": 36.90,
     "descripcion": "Jamón americano y queso mozzarella", "image_key": "pizzas/americana.jpg"},
    {"id": "pz-hawaiana", "nombre": "Hawaiana", "categoria": "pizzas", "precio": 39.90,
     "descripcion": "Jamón, piña y queso mozzarella", "image_key": "pizzas/hawaiana.jpg"},
    {"id": "pz-superpapa", "nombre": "Super Papa", "categoria": "pizzas", "precio": 49.90,
     "descripcion": "Pepperoni, jamón, salchicha, champiñones, pimiento y cebolla", "image_key": "pizzas/superpapa.jpg"},
    {"id": "pz-cheese", "nombre": "Cheese", "categoria": "pizzas", "precio": 33.90,
     "descripcion": "Queso mozzarella y nuestra salsa de tomate", "image_key": "pizzas/cheese.jpg"},
    {"id": "pz-bbqchicken", "nombre": "BBQ Chicken", "categoria": "pizzas", "precio": 45.90,
     "descripcion": "Pollo a la BBQ, tocino y cebolla", "image_key": "pizzas/bbqchicken.jpg"},
    # Complementos
    {"id": "cp-breadsticks", "nombre": "Palitos de Ajo", "categoria": "complementos", "precio": 12.90,
     "descripcion": "Palitos de pan con ajo y queso parmesano", "image_key": "complementos/breadsticks.jpg"},
    {"id": "cp-cheesesticks", "nombre": "Cheesesticks", "categoria": "complementos", "precio": 18.90,
     "descripcion": "Palitos de pan cubiertos de queso mozzarella", "image_key": "complementos/cheesesticks.jpg"},
    {"id": "cp-poppers", "nombre": "Chicken Poppers", "categoria": "complementos", "precio": 21.90,
     "descripcion": "Trozos de pollo empanizado con salsa a elección", "image_key": "complementos/poppers.jpg"},
    # Bebidas
    {"id": "bd-pepsi15", "nombre": "Pepsi 1.5L", "categoria": "bebidas", "precio": 9.90,
     "descripcion": "Gaseosa Pepsi botella 1.5 litros", "image_key": "bebidas/pepsi15.jpg"},
    {"id": "bd-agua", "nombre": "Agua San Luis 625ml", "categoria": "bebidas", "precio": 4.90,
     "descripcion": "Agua sin gas", "image_key": "bebidas/agua.jpg"},
    # Postres
    {"id": "ps-brownie", "nombre": "Mega Brownie", "categoria": "postres", "precio": 15.90,
     "descripcion": "Brownie de chocolate familiar", "image_key": "postres/brownie.jpg"},
]

TENANTS = ["pj-miraflores", "pj-surco"]
