from django.db import models
from django.contrib.auth.models import User

class UserProfile(models.Model):
    RoleChoices = (
        ('manager','MANAGER'),
        ('employee','EMPLOYEE')
    )
    user = models.OneToOneField(User,on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20,choices=RoleChoices,default='employee')
    created_at = models.DateTimeField(auto_now_add=True)
    modified_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True,blank=True,related_name='modified_userprofile')
    modified_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username} ({self.role})"



class Project(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(User,on_delete=models.CASCADE,related_name='project_created')
    members = models.ManyToManyField(User,related_name='projects',blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True,related_name='projects_modified')
    modified_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return self.name
    
    class Meta:
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['created_by'])
        ]

class ProjectTask(models.Model):
    priority_choice = (
        ('low','LOW'),
        ('medium','MEDIUM'),
        ('high','HIGH')
    )
    status_choice = (
        ('todo','TODO'),
        ('doing','DOING'),
        ('completed','COMPLETED'),
        ('pending','PENDING'),
        ('rejected','REJECTED')
    )

    project = models.ForeignKey(Project,on_delete=models.CASCADE,related_name='tasks')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL,null=True, blank=True, related_name='task_assigned_by')
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL,null=True, blank=True, related_name='task_assigned_to')
    priority = models.CharField(max_length=20,choices=priority_choice,default='medium')
    status = models.CharField(max_length=20,choices=status_choice,default='todo')
    eta = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,blank=True,related_name='task_modified')
    modified_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} [{self.project.name}]"
    
    class Meta:
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['assigned_to','status'])
        ]