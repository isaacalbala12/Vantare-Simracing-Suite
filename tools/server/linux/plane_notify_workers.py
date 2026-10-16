"""Ejecutado por manage.py shell dentro de Plane, sin credenciales propias."""

from contextlib import redirect_stderr, redirect_stdout
import io
import json

PROJECT = "89da40f4-ae2a-443d-9e3e-6024e01247c9"
BOT_EMAIL = "workers-bot@vantare.local"


def notification_arguments(activity, serialized, comment=None):
    kind = ("comment.activity.created" if activity.field == "comment" else
            "issue.activity.created" if activity.verb == "created" else "issue.activity.updated")
    requested, previous = {}, None
    if activity.field == "comment":
        requested = comment
    elif activity.field == "description":
        requested = {"description_html": activity.issue.description_html or ""}
        previous = {"description_html": activity.old_value or ""}
    elif activity.field == "state":
        requested = {"state": str(activity.new_identifier)}
        previous = {"state": str(activity.old_identifier)}
    elif activity.verb == "created":
        requested = {"description_html": activity.issue.description_html or ""}
    # Los campos calculados de DRF pueden conservar UUID: convertirlos a texto,
    # igual que DjangoJSONEncoder en la llamada web, sin depender de Django aquí.
    return dict(type=kind, issue_id=str(activity.issue_id), project_id=PROJECT,
                actor_id=str(activity.actor_id), subscriber=False,
                issue_activities_created=json.dumps([serialized], default=str),
                requested_data=json.dumps(requested, default=str),
                current_instance=json.dumps(previous, default=str) if previous is not None else None)


def notify(activity_id, revision=None):
    from django.db import transaction
    from plane.app.serializers import IssueActivitySerializer, IssueCommentSerializer
    from plane.bgtasks.notification_task import notifications
    from plane.db.models import IssueActivity, IssueSubscriber, Notification, ProjectMember

    with transaction.atomic():
        # El lock + la notificación persistida cubren la pérdida del acuse Docker.
        activity = IssueActivity.objects.select_for_update(of=("self",)).select_related(
            "issue__state", "issue__project", "actor").get(pk=activity_id, project_id=PROJECT)
        if activity.actor.email != BOT_EMAIL or not activity.actor.is_bot:
            raise ValueError("Actor no autorizado")
        if not ((activity.field in ("state", "description") and activity.verb == "updated")
                or (activity.field == "comment" and activity.verb == "created")
                or (not activity.field and activity.verb == "created")):
            raise ValueError("Actividad no autorizada")
        existing = Notification.objects.filter(
            project_id=PROJECT, entity_identifier=activity.issue_id,
            triggered_by_id=activity.actor_id, data__issue_activity__id=str(activity.id))
        if activity.field == "description":
            existing = existing.filter(data__workers_revision=revision)
        if not existing.exists():
            serialized = json.loads(json.dumps(IssueActivitySerializer(activity).data, default=str))
            comment = (IssueCommentSerializer(activity.issue_comment).data
                       if activity.field == "comment" else None)
            args = notification_arguments(activity, serialized, comment)
            # La función nativa hace print y return al fallar. No confirmar ni
            # filtrar ese mensaje al journal: rollback y reintento seguro.
            captured = io.StringIO()
            with redirect_stdout(captured), redirect_stderr(captured):
                notifications(**args)
            if captured.getvalue():
                raise RuntimeError("Plane no completó notifications")
            members = ProjectMember.objects.filter(project_id=PROJECT, is_active=True).values_list("member_id", flat=True)
            subscribers = IssueSubscriber.objects.filter(
                project_id=PROJECT, issue_id=activity.issue_id,
                subscriber_id__in=members).exclude(subscriber_id=activity.actor_id)
            for subscriber in subscribers:
                target = Notification.objects.filter(
                    project_id=PROJECT, receiver_id=subscriber.subscriber_id,
                    entity_identifier=activity.issue_id, data__issue_activity__id=str(activity.id))
                if activity.field == "description":
                    target = target.filter(data__workers_revision=revision)
                    if not target.exists():
                        # Plane omite descripciones sin mención. Completar solo
                        # ese caso; conservar field/id originales, sin tocar Plane.
                        issue = activity.issue
                        Notification.objects.create(
                            workspace_id=activity.workspace_id, project_id=PROJECT,
                            sender="in_app:issue_activities:subscribed",
                            triggered_by_id=activity.actor_id, receiver_id=subscriber.subscriber_id,
                            entity_identifier=activity.issue_id, entity_name="issue",
                            title="ha actualizado la descripción",
                            data={"workers_revision": revision, "issue": {
                                "id": str(issue.id), "name": issue.name,
                                "identifier": issue.project.identifier, "sequence_id": issue.sequence_id,
                                "state_name": issue.state.name, "state_group": issue.state.group},
                                "issue_activity": {"actor": str(activity.actor_id), **{k: serialized.get(k) for k in (
                                    "id", "verb", "field", "actor_id", "new_value", "old_value",
                                    "old_identifier", "new_identifier")}}})
                if not target.exists():
                    raise RuntimeError("Falta la campana de un suscriptor")
    print("WORKERS_NOTIFICATION_OK")
