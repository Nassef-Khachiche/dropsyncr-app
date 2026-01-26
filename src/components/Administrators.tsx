import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Plus, Search, Edit, Trash2, Shield, Mail, User, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  isGlobalAdmin: boolean;
  installations: Array<{ id: number; name: string }>;
  createdAt: string;
}

export function Administrators() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [installations, setInstallations] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'user',
    isGlobalAdmin: false,
    installationIds: [] as number[],
  });

  useEffect(() => {
    loadUsers();
    loadInstallations();
  }, [searchQuery]);

  useEffect(() => {
    console.log('Current users state:', users);
  }, [users]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getUsers({
        search: searchQuery || undefined,
        limit: 100,
      });
      console.log('Users loaded:', data);
      setUsers(data.users || []);
    } catch (error: any) {
      console.error('Failed to load users:', error);
      const errorMessage = error.message || 'Failed to load administrators';
      setError(errorMessage);
      toast.error(errorMessage);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadInstallations = async () => {
    try {
      const data = await api.getInstallationsList({ limit: 1000 });
      setInstallations(data.installations || []);
    } catch (error) {
      console.error('Failed to load installations:', error);
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      name: '',
      role: 'user',
      isGlobalAdmin: false,
      installationIds: [],
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      role: user.role,
      isGlobalAdmin: user.isGlobalAdmin,
      installationIds: user.installations.map(i => i.id),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await api.deleteUser(id);
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete user');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.name || (!editingUser && !formData.password)) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const submitData = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
        isGlobalAdmin: formData.isGlobalAdmin,
        installationIds: formData.installationIds,
        ...(formData.password && { password: formData.password }),
      };

      if (editingUser) {
        await api.updateUser(editingUser.id, submitData);
        toast.success('User updated successfully');
      } else {
        await api.createUser(submitData);
        toast.success('User created successfully');
      }

      setIsDialogOpen(false);
      setFormData({
        email: '',
        password: '',
        name: '',
        role: 'user',
        isGlobalAdmin: false,
        installationIds: [],
      });
      setEditingUser(null);
      await loadUsers();
    } catch (error: any) {
        toast.error('This email address is already in use. Please use a different email.', {
          duration: 4000,
        });
    }
  };

  const toggleInstallation = (installationId: number) => {
    setFormData(prev => ({
      ...prev,
      installationIds: prev.installationIds.includes(installationId)
        ? prev.installationIds.filter(id => id !== installationId)
        : [...prev.installationIds, installationId],
    }));
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Administrators</CardTitle>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Nieuwe Administrator
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Zoek op email of naam..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead>Naam</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Installaties</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        {error ? (
                          <div className="space-y-2">
                            <p className="text-red-600 font-medium">Error loading users</p>
                            <p className="text-sm text-slate-500">{error}</p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => loadUsers()}
                              className="mt-2"
                            >
                              Try Again
                            </Button>
                          </div>
                        ) : (
                          <p className="text-slate-500">Geen gebruikers gevonden</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400" />
                            <span>{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span>{user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {user.isGlobalAdmin ? (
                            <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 border-0 gap-1">
                              <Shield className="w-3 h-3" />
                              Global Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline">Gebruiker</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.installations.length > 0 ? (
                              user.installations.map((inst) => (
                                <Badge key={inst.id} variant="outline" className="text-xs">
                                  {inst.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-slate-400">Geen installaties</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(user)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(user.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Bewerk Administrator' : 'Nieuwe Administrator'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Wijzig de gegevens van deze administrator'
                : 'Maak een nieuwe administrator account aan'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Naam *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">
                  {editingUser ? 'Nieuw Wachtwoord (optioneel)' : 'Wachtwoord *'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rol</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: any) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Gebruiker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isGlobalAdmin"
                  checked={formData.isGlobalAdmin}
                  onCheckedChange={(checked: boolean) =>
                    setFormData({ ...formData, isGlobalAdmin: checked === true })
                  }
                />
                <Label htmlFor="isGlobalAdmin" className="cursor-pointer">
                  Global Administrator (heeft toegang tot alle installaties)
                </Label>
              </div>
            </div>

            {!formData.isGlobalAdmin && (
              <div className="space-y-2">
                <Label>Toegewezen Installaties</Label>
                <div className="border border-slate-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {installations.length === 0 ? (
                    <p className="text-sm text-slate-500">Geen installaties beschikbaar</p>
                  ) : (
                    <div className="space-y-2">
                      {installations.map((inst) => (
                        <div key={inst.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`inst-${inst.id}`}
                            checked={formData.installationIds.includes(inst.id)}
                            onCheckedChange={() => toggleInstallation(inst.id)}
                          />
                          <Label
                            htmlFor={`inst-${inst.id}`}
                            className="cursor-pointer flex-1"
                          >
                            {inst.name} ({inst.type})
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Annuleren
              </Button>
              <Button type="submit">
                {editingUser ? 'Bijwerken' : 'Aanmaken'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

