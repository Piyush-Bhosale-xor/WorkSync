from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsProjectAccess(BasePermission):
    def has_permission(self, request, view):
        if request.user.profile.role == 'manager':
            return True
        
        if request.user.profile.role == 'employee':
            return request.method in SAFE_METHODS
        
        else:
            return False
    
    def has_object_permission(self, request, view, obj):
        if request.user.profile.role == 'manager':
            return obj.created_by == request.user
        
        if request.user.profile.role == 'employee':
            if request.method in SAFE_METHODS:
                return obj.members.filter(id=request.user.id).exists()
        else:
            return False
        

class IsTaskAccess(BasePermission):
    def has_permission(self, request, view):
        if request.user.profile.role == 'manager':
            return True
        
        if request.user.profile.role == 'employee':
            if request.method in SAFE_METHODS or request.method in ('PUT','PATCH'):
                return True
        else :
            return False
    
    def has_object_permission(self, request, view, obj):
        if request.user.profile.role == 'manager':
            return obj.project.created_by == request.user
        
        if request.user.profile.role == 'employee':
            if request.method in ['DELETE','POST']:
                return False
            if request.method in SAFE_METHODS or request.method in ('PUT','PATCH'):
                return obj.assigned_to == request.user
            else:
                return False
        return False
    

class IsManager(BasePermission):
    def has_permission(self, request, view):
        return request.user.profile.role == 'manager'
    def has_object_permission(self, request, view, obj):
        if request.user.profile.role == 'manager':
            return obj.project.created_by == request.user 
    
class IsEmployee(BasePermission):
    def has_permission(self, request, view):
        return request.user.profile.role == 'employee'
    def has_object_permission(self, request, view, obj):
        if request.user.profile.role == 'employee':
            return obj.assigned_to == request.user
        

class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method == 'GET':
            return True
        else :
            return False
    
    def has_object_permission(self, request, view, obj):
        if request.method == 'GET':
            return True
        else :
            return False