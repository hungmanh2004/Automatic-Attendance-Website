from celery import Celery, Task


def create_celery(flask_app):
    class FlaskTask(Task):
        def __call__(self, *args, **kwargs):
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery_app = Celery(
        flask_app.import_name,
        broker=flask_app.config["CELERY_BROKER_URL"],
        backend=flask_app.config["CELERY_RESULT_BACKEND"],
    )
    celery_app.Task = FlaskTask
    celery_app.conf.update(
        accept_content=["json"],
        broker_connection_retry_on_startup=True,
        result_expires=flask_app.config["CELERY_TASK_RESULT_EXPIRES"],
        task_serializer="json",
        result_serializer="json",
        task_track_started=True,
        task_time_limit=flask_app.config["CELERY_TASK_TIME_LIMIT"],
    )

    from .tasks.guest_tasks import register_guest_tasks

    register_guest_tasks(celery_app)
    return celery_app
