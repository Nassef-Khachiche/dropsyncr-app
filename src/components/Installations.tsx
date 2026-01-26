import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Plus, Search, Edit, Trash2, Building2, Users, Package, ShoppingCart, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

interface Installation {
  id: number;
  name: string;
  type: string;
  country: string;
  contract?: string;
  active: boolean;
  users: Array<{ id: number; email: string; name: string }>;
  orderCount: number;
  productCount: number;
  createdAt: string;
}

export function Installations() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInstallation, setEditingInstallation] = useState<Installation | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    type: 'own',
    country: 'NL',
    contract: '',
    active: true,
    userIds: [] as number[],
  });

  useEffect(() => {
    loadInstallations();
    loadUsers();
  }, [searchQuery, filterType]);

  const loadInstallations = async () => {
    try {
      setLoading(true);
      const data = await api.getInstallationsList({
        search: searchQuery || undefined,
        type: filterType !== 'all' ? filterType : undefined,
        limit: 100,
      });
      setInstallations(data.installations || []);
    } catch (error: any) {
      console.error('Failed to load installations:', error);
      const errorMessage = error.message || 'Failed to load installations';
      toast.error(errorMessage);
      
      // If it's an auth error, suggest logging out and back in
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        toast.error('Authentication failed. Please log out and log back in.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await api.getUsers({ limit: 1000 });
      setAllUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleCreate = () => {
    setEditingInstallation(null);
    setFormData({
      name: '',
      type: 'own',
      country: 'NL',
      contract: '',
      active: true,
      userIds: [],
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (installation: Installation) => {
    setEditingInstallation(installation);
    setFormData({
      name: installation.name,
      type: installation.type,
      country: installation.country,
      contract: installation.contract || '',
      active: installation.active,
      userIds: installation.users.map(u => u.id),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this installation? This will delete all associated data.')) return;

    try {
      await api.deleteInstallation(id);
      toast.success('Installation deleted successfully');
      loadInstallations();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete installation');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.type || !formData.country) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const submitData = {
        name: formData.name,
        type: formData.type,
        country: formData.country,
        contract: formData.contract || undefined,
        active: formData.active,
        userIds: formData.userIds,
      };

      if (editingInstallation) {
        await api.updateInstallation(editingInstallation.id, submitData);
        toast.success('Installation updated successfully');
      } else {
        await api.createInstallation(submitData);
        toast.success('Installation created successfully');
      }

      setIsDialogOpen(false);
      loadInstallations();
    } catch (error: any) {
      console.error('Installation save error:', error);
      const errorMessage = error.message || 'Failed to save installation';
      toast.error(errorMessage);
      
      // If it's an auth error, suggest logging out and back in
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        toast.error('Authentication failed. Please log out and log back in.');
      }
    }
  };

  const toggleUser = (userId: number) => {
    setFormData(prev => ({
      ...prev,
      userIds: prev.userIds.includes(userId)
        ? prev.userIds.filter(id => id !== userId)
        : [...prev.userIds, userId],
    }));
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Installaties</CardTitle>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Nieuwe Installatie
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Zoek installaties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle types</SelectItem>
                <SelectItem value="own">Eigen stores</SelectItem>
                <SelectItem value="fulfilment">Fulfilment</SelectItem>
              </SelectContent>
            </Select>
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
                    <TableHead>Type</TableHead>
                    <TableHead>Land</TableHead>
                    <TableHead>Gebruikers</TableHead>
                    <TableHead>Statistieken</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                        Geen installaties gevonden
                      </TableCell>
                    </TableRow>
                  ) : (
                    installations.map((installation) => (
                      <TableRow key={installation.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-indigo-600" />
                            <span className="font-medium">{installation.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              installation.type === 'own'
                                ? 'border-indigo-300 text-indigo-700 bg-indigo-50'
                                : 'border-purple-300 text-purple-700 bg-purple-50'
                            }
                          >
                            {installation.type === 'own' ? 'Eigen Store' : 'Fulfilment'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{installation.country}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-400" />
                            <span className="text-sm">{installation.users.length} gebruiker(s)</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <div className="flex items-center gap-1">
                              <ShoppingCart className="w-4 h-4" />
                              <span>{installation.orderCount || 0} orders</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Package className="w-4 h-4" />
                              <span>{installation.productCount || 0} producten</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {installation.active ? (
                            <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">
                              Actief
                            </Badge>
                          ) : (
                            <Badge variant="outline">Inactief</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(installation)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(installation.id)}
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
              {editingInstallation ? 'Bewerk Installatie' : 'Nieuwe Installatie'}
            </DialogTitle>
            <DialogDescription>
              {editingInstallation
                ? 'Wijzig de gegevens van deze installatie'
                : 'Maak een nieuwe installatie/store aan'}
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
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own">Eigen Store</SelectItem>
                    <SelectItem value="fulfilment">Fulfilment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">Land *</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NL">Nederland (NL)</SelectItem>
                    <SelectItem value="BE">België (BE)</SelectItem>
                    <SelectItem value="DE">Duitsland (DE)</SelectItem>
                    <SelectItem value="FR">Frankrijk (FR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contract">Contract (optioneel)</Label>
                <Input
                  id="contract"
                  value={formData.contract}
                  onChange={(e) => setFormData({ ...formData, contract: e.target.value })}
                  placeholder="Bijv. Premium - €2.50/order"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, active: checked })
                  }
                />
                <Label htmlFor="active" className="cursor-pointer">
                  Actief
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Toegewezen Gebruikers</Label>
              <div className="border border-slate-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                {allUsers.length === 0 ? (
                  <p className="text-sm text-slate-500">Geen gebruikers beschikbaar</p>
                ) : (
                  <div className="space-y-2">
                    {allUsers.map((user) => (
                      <div key={user.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`user-${user.id}`}
                          checked={formData.userIds.includes(user.id)}
                          onChange={() => toggleUser(user.id)}
                          className="rounded border-slate-300"
                        />
                        <Label
                          htmlFor={`user-${user.id}`}
                          className="cursor-pointer flex-1"
                        >
                          {user.name} ({user.email})
                          {user.isGlobalAdmin && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Global Admin
                            </Badge>
                          )}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Annuleren
              </Button>
              <Button type="submit">
                {editingInstallation ? 'Bijwerken' : 'Aanmaken'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

