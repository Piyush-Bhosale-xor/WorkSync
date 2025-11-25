from django.shortcuts import render
from .models import UserProfile, Project, ProjectTask
from django.contrib.auth.models import User
from .serializers import UserProfileSerializer, ProjectSerializer, ProjectTaskSerializer, UserMiniSerializer
from rest_framework import viewsets
from .permissions import IsProjectAccess, IsTaskAccess, IsEmployee, IsManager, ReadOnly
from rest_framework.permissions import  AllowAny,IsAuthenticated
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from .mypagination import MyPagination

class UserProfileAPI(viewsets.ModelViewSet):
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer

    def get_permissions(self):
        if self.action == 'create':
            permission_classes = [AllowAny]
        elif self.action in ['retrieve','list']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [IsAuthenticated, IsManager]
        return [p() for p in permission_classes]


class ListUserAPI(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserMiniSerializer
    permission_classes = [IsAuthenticated, ReadOnly]



class ProjectAPI(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsProjectAccess]

    def get_queryset(self):
        if self.request.user.profile.role == 'manager':
            return Project.objects.filter(created_by = self.request.user, is_deleted = False)
        
        if self.request.user.profile.role == 'employee':
            return Project.objects.filter(members = self.request.user, is_deleted = False)
        else :
            return Project.objects.none()
    
    def perform_create(self, serializer):
        return serializer.save(created_by = self.request.user, modified_by = self.request.user)
    
    def perform_update(self, serializer):
        return serializer.save(modified_by = self.request.user)


class ProjectTaskAPI(viewsets.ModelViewSet):

    serializer_class = ProjectTaskSerializer
    permission_classes = [IsTaskAccess]
    filter_backends = [SearchFilter]
    search_fields = ['=assigned_to__username','=project__id','=priority','=status']
    pagination_class = MyPagination

    def get_queryset(self):
        if self.request.user.profile.role == 'manager':
            return ProjectTask.objects.filter(assigned_by = self.request.user.id, is_deleted = False)
        
        if self.request.user.profile.role == 'employee':
            return ProjectTask.objects.filter(assigned_to = self.request.user.id, is_deleted = False)

        return ProjectTask.objects.none()

    def perform_create(self, serializer):
        return serializer.save(assigned_by= self.request.user, modified_by = self.request.user)
    
    def perform_update(self, serializer):
        return serializer.save(modified_by = self.request.user)
    
    def destroy(self, request,*args, **kwargs):
        if request.user.profile.role == 'employee':
            return Response({'msg':'Employee is not authorised to perform deleted operation.'}, status=403) 
        if request.user.profile.role == 'manager':
            task_id = kwargs['pk']
            task = ProjectTask.objects.get(id = task_id)
            manager_id = request.user 
            owner = task.assigned_by
            if manager_id == owner:
                task.is_deleted = True
                task.modified_by = request.user
                task.modified_at = timezone.now()
                task.save()
                return Response({'msg':'Deleted succesfully'},status=200)
            else:
                return Response({'msg':'Only owner of project is authorised to perform operation.'}, status=403)
        else :
            return Response({'msg':'You are not authorised to perform deleted operation.'}, status=403) 
        

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_role(request):
    return Response({
        'id': request.user.id,
        'username': request.user.username,
        'role' : request.user.profile.role
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated,IsEmployee])
def create_task_emp(request):
    data = request.data.copy()
    data['status'] = 'pending'
    data['assigned_to'] = request.user.id
    project = Project.objects.get(id = data.get('project'))
    data['assigned_by'] = project.created_by.id
    if request.user.profile.role == 'employee':
        task = ProjectTaskSerializer(data = data)
        if task.is_valid():
            task.save()
            return Response({
                'msg' : 'Task created successfully'
            })
        return Response({
            'msg' : task.errors
        })
    


@api_view(['PUT','PATCH'])
@permission_classes([IsAuthenticated, IsManager])
def approve(request,pk):
    instance = ProjectTask.objects.get(id = pk)
    data = request.data.copy()
    data['assigned_by'] = request.user.id
    data['modified_by'] = request.user.id
    data['status'] = 'todo'
    task = ProjectTaskSerializer(instance = instance,data = data, partial = True)
    if task.is_valid():
        task.save()
        return Response({'msg':'Task Created successfully'})
    return Response({'msg': task.errors})



@api_view(['PUT','PATCH'])
@permission_classes([IsAuthenticated, IsManager])
def reject(request,pk):
    instance = ProjectTask.objects.get(id = pk)
    data = request.data.copy()
    data['status'] = 'rejected'
    data['modified_by'] = request.user.id
    task = ProjectTaskSerializer(instance = instance,data = data, partial = True)
    if task.is_valid():
        task.save()
        return Response({'msg':'Task has been rejected'})
    return Response({'msg':task.errors})