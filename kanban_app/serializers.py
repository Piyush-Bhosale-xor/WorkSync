from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, Project, ProjectTask
from datetime import date
from django.utils import timezone

class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id','username']

class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required = False)
    email = serializers.EmailField(write_only= True, required = False)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'}, required = False )

    user = UserMiniSerializer(read_only = True)
    class Meta:
        model = UserProfile
        fields = '__all__'
    
    def create(self,validated_data):
        username = validated_data.pop('username')
        email = validated_data.pop('email')
        password = validated_data.pop('password')

        user = User.objects.create(username=username, email= email)
        user.set_password(password)
        user.save()

        profile = UserProfile.objects.create(user = user, **validated_data)
        return profile
    
    def update(self, instance ,validated_data):
        validated_data.pop('username',None)
        validated_data.pop('email',None)
        validated_data.pop('password',None)

        for attr, value in validated_data.items():
            setattr(instance , attr, value)
        instance.save()
        return instance
    
class ProjectSerializer(serializers.ModelSerializer):
    created_by_user = UserMiniSerializer(source="created_by", read_only=True)
    members_user = UserMiniSerializer(source="members", many=True, read_only=True)

    # keep writes simple
    members = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), many=True, write_only=True, required=False)
    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_by','created_at','modified_by','modified_at']


class ProjectTaskSerializer(serializers.ModelSerializer):
    assigned_to_user = UserMiniSerializer(source="assigned_to", read_only=True)
    assigned_by_user = UserMiniSerializer(source="assigned_by", read_only=True)

    # WRITE: accept a user id (PK)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    delay_status = serializers.SerializerMethodField(read_only = True)
    task_age = serializers.SerializerMethodField(read_only = True)
    days_left = serializers.SerializerMethodField(read_only = True)
    delayed_days = serializers.SerializerMethodField(read_only = True)

    class Meta:
        model = ProjectTask
        fields =  [
            "id","assigned_to_user","assigned_by_user","project","name","description","assigned_by","assigned_to",
            "priority","status","eta","created_at","modified_at","modified_by","delay_status","task_age","days_left","delayed_days",'is_deleted'
        ]
        read_only_fields = ['created_at','modified_at',]

    def _get_eta_date(self, obj):
        """
        Normalize eta/due_date to a date object. Returns None if no ETA.
        """
        eta = getattr(obj, "eta", None) or getattr(obj, "due_date", None)
        if eta is None:
            return None
        # if eta is a datetime -> convert to date
        try:
            return eta.date()
        except Exception:
            return eta  # already a date

    def get_delay_status(self, obj):
        """
        True if task is delayed (now > eta) AND task not completed.
        """
        eta_date = self._get_eta_date(obj)
        if not eta_date:
            return False
        today = timezone.now().date()
        # treat completed tasks as not delayed
        if getattr(obj, "status", None) == "completed":
            return False
        return today > eta_date

    def get_task_age(self, obj):
        """
        Days since created_at (integer >= 0). Uses server timezone.
        """
        if not obj.created_at:
            return 0
        today = timezone.now().date()
        created_date = obj.created_at.date()
        delta = today - created_date
        return max(delta.days, 0)

    def get_days_left(self, obj):
        """
        Days left until ETA (>= 0). If due today -> 0. If no ETA -> None.
        """
        eta_date = self._get_eta_date(obj)
        if not eta_date:
            return None
        today = timezone.now().date()
        delta = eta_date - today
        return max(delta.days, 0)

    def get_delayed_days(self, obj):
        """
        Number of days overdue (>= 0). 0 if not overdue or no ETA.
        """
        if getattr(obj, "status", None) == "completed":
            return 0
        eta_date = self._get_eta_date(obj)
        if not eta_date:
            return 0
        today = timezone.now().date()
        if today <= eta_date:
            return 0
        delta = today - eta_date
        return max(delta.days, 0)
    