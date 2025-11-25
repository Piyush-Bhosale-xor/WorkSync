from django.contrib import admin
from .models import Project, ProjectTask, UserProfile, User
from django.contrib.auth.admin import UserAdmin

# Unregister original User admin
admin.site.unregister(User)

# Customize UserAdmin
@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('id', 'username', 'email', 'first_name', 'last_name', 'is_staff')

# Register your models here.
@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['id','user','role','is_deleted']
    list_filter = ['role']
    search_fields = ['user__username']

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['id','name','created_by']
    list_filter = ['created_by']
    search_fields = ['name']

@admin.register(ProjectTask)
class ProjectTaskAdmin(admin.ModelAdmin):
    list_display = ['id','name','project','assigned_by','assigned_to','status','priority']
    list_filter = ['status','priority','assigned_by','assigned_to']
    search_fields = ['name','project']