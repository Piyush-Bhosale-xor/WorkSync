from django.urls import path,include
from .views import UserProfileAPI, ProjectAPI, ProjectTaskAPI, ListUserAPI, current_user_role, create_task_emp, approve, reject
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register("user",UserProfileAPI, basename='user')
router.register('project',ProjectAPI, basename='project')
router.register('task',ProjectTaskAPI,basename='task')
router.register('get_user',ListUserAPI, basename='getuser')

urlpatterns = [
    path("",include(router.urls)),
    path("",include('rest_framework.urls')),
    path("user/me",current_user_role),
    path("emp_task", create_task_emp),
    path("task_approve/<int:pk>/", approve ),
    path("task_reject/<int:pk>/",reject)
]