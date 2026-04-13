'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Pencil, Trash2 } from 'lucide-react';

export default function StaffPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    full_name: '',
    username: '',
    department: 'Shop',
    password: ''
  });
  
  const { data: staffList = [], mutate } = useSWR('staff_list', async () => {
    // Only fetch staff, not Root
    const { data } = await supabase
      .from('users')
      .select('*, roles!inner(name)')
      .eq('roles.name', 'Staff')
      .order('created_at', { ascending: false });
    return data || [];
  });

  const { data: staffRole } = useSWR('role_staff', async () => {
    const { data } = await supabase.from('roles').select('id').eq('name', 'Staff').single();
    return data;
  });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!staffRole) return;

    if (formData.id) {
      // Update existing
      const updatePayload = {
        full_name: formData.full_name,
        username: formData.username,
        department: formData.department
      };
      if (formData.password) {
        updatePayload.password_hash = formData.password;
      }
      
      await supabase.from('users').update(updatePayload).eq('id', formData.id);
    } else {
      // Create new
      await supabase.from('users').insert({
        full_name: formData.full_name,
        username: formData.username,
        password_hash: formData.password,
        department: formData.department,
        role_id: staffRole.id
      });
    }
    
    setIsDialogOpen(false);
    setFormData({ id: null, full_name: '', username: '', department: 'Shop', password: '' });
    mutate();
  };

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this staff member?")) {
      await supabase.from('users').delete().eq('id', id);
      mutate();
    }
  };

  const editStaff = (s) => {
    setFormData({
      id: s.id,
      full_name: s.full_name || '',
      username: s.username || '',
      department: s.department || 'Shop',
      password: '' // Don't pre-fill password, leave blank unless changing
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Staff Management</h2>
          <p className="text-muted-foreground text-sm">Create and manage staff accounts and their departments.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => setFormData({ id: null, full_name: '', username: '', department: 'Shop', password: '' })}>
              <Plus className="mr-2 h-4 w-4" />
              Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{formData.id ? 'Edit Staff' : 'Add New Staff'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="janedoe" />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={formData.department} onValueChange={v => setFormData({...formData, department: v})}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Shop">Shop</SelectItem>
                    <SelectItem value="Kitchen">Kitchen</SelectItem>
                    <SelectItem value="Store">Store</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{formData.id ? 'New Password (leave blank to keep current)' : 'Password'}</Label>
                <Input type="password" required={!formData.id} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="***" />
              </div>
              <Button type="submit" className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500">Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffList.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No staff created yet.</TableCell></TableRow>
              ) : staffList.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>{s.username}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-secondary rounded-md text-xs font-medium">
                      {s.department || 'Unassigned'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => editStaff(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
