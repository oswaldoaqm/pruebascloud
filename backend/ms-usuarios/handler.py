import json


def hello(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "message": "ms-usuarios desplegado correctamente",
            "grupo": "Grupo 2 - Papa Johns",
        }),
    }
