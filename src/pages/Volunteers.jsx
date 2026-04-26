import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { servexApi } from '@/api/servexClient';
import VolunteerFormModal from '@/components/volunteers/VolunteerFormModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Plus, Search, Phone, Mail, MapPin, Trash2, Pencil, MessageSquare, Loader2 } from 'lucide-react';

const statusConfig = {
  active: { label: 'Active', dot: 'bg-servex-indigo', badge: 'bg-servex-periwinkle/55 text-servex-navy' },
  deployed: { label: 'Deployed', dot: 'bg-servex-navy', badge: 'bg-servex-navy text-servex-blush' },
  unavailable: { label: 'Unavailable', dot: 'bg-servex-periwinkle', badge: 'bg-servex-blush text-servex-navy border border-servex-periwinkle/70' },
};

const assignmentPriorities = ['low', 'normal', 'high', 'critical'];

export default function Volunteers() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentVolunteer, setAssignmentVolunteer] = useState(null);
  const [assignmentTask, setAssignmentTask] = useState('');
  const [assignmentNeedTitle, setAssignmentNeedTitle] = useState('');
  const [assignmentPhone, setAssignmentPhone] = useState('');
  const [assignmentPriority, setAssignmentPriority] = useState('normal');
  const [assignmentDueDate, setAssignmentDueDate] = useState('');
  const [assigning, setAssigning] = useState(false);

  const { data: volunteers = [], isLoading } = useQuery({
    queryKey: ['volunteers'],
    queryFn: () => servexApi.entities.Volunteer.list('-created_date', 200),
  });

  const filtered = volunteers.filter(v => {
    const matchSearch = !search || v.full_name?.toLowerCase().includes(search.toLowerCase()) || v.location?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || v.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleDelete = async (id) => {
    await servexApi.entities.Volunteer.delete(id);
    qc.invalidateQueries(['volunteers']);
  };

  const openAssignmentModal = (volunteer) => {
    setAssignmentVolunteer(volunteer);
    setAssignmentTask('');
    setAssignmentNeedTitle('');
    setAssignmentPhone(volunteer?.phone || '');
    setAssignmentPriority('normal');
    setAssignmentDueDate('');
    setAssignmentModalOpen(true);
  };

  const closeAssignmentModal = () => {
    if (assigning) return;
    setAssignmentModalOpen(false);
    setAssignmentVolunteer(null);
  };

  const submitAssignment = async () => {
    if (!assignmentVolunteer?.id || !assignmentTask.trim()) {
      toast({
        title: 'Task is required',
        description: 'Enter a volunteer task before sending assignment.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setAssigning(true);
      await servexApi.integrations.Volunteers.assignChatbotTask({
        volunteerId: assignmentVolunteer.id,
        task: assignmentTask,
        need_title: assignmentNeedTitle,
        phone: assignmentPhone || undefined,
        priority: assignmentPriority,
        due_date: assignmentDueDate,
      });

      toast({
        title: 'Assignment sent',
        description: `${assignmentVolunteer.full_name} received the chatbot assignment.`,
      });

      setAssignmentModalOpen(false);
      setAssignmentVolunteer(null);
      qc.invalidateQueries(['volunteers']);
      qc.invalidateQueries(['dispatches']);
    } catch (error) {
      toast({
        title: 'Failed to send assignment',
        description: error?.message || 'Please verify WhatsApp configuration and volunteer phone number.',
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  const activeCount = volunteers.filter(v => v.status === 'active').length;
  const deployedCount = volunteers.filter(v => v.status === 'deployed').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-jakarta text-foreground">Volunteers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {activeCount} available - {deployedCount} deployed - {volunteers.length} total
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> Add Volunteer
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search volunteers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['active', 'deployed', 'unavailable'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <div key={i} className="h-40 bg-card rounded-xl border animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg font-medium">No volunteers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(vol => {
            const st = statusConfig[vol.status] || statusConfig.active;
            return (
              <div key={vol.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">{vol.full_name?.charAt(0)?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{vol.full_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => { setEditing(vol); setShowForm(true); }}>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => handleDelete(vol.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 mb-3">
                  {vol.email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{vol.email}</div>}
                  {vol.phone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{vol.phone}</div>}
                  {vol.location && <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{vol.location}</div>}
                </div>

                {vol.skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {vol.skills.slice(0, 3).map(s => (
                      <span key={s} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{s.replace(/_/g, ' ')}</span>
                    ))}
                    {vol.skills.length > 3 && <span className="text-xs text-muted-foreground">+{vol.skills.length - 3} more</span>}
                  </div>
                )}

                {vol.total_missions > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">{vol.total_missions} missions completed</p>
                )}

                <Button
                  variant="outline"
                  className="w-full mt-3 gap-2"
                  onClick={() => openAssignmentModal(vol)}
                >
                  <MessageSquare className="w-4 h-4" />
                  Assign via Chatbot
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <VolunteerFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => qc.invalidateQueries(['volunteers'])}
          initial={editing}
        />
      )}

      <Dialog open={assignmentModalOpen} onOpenChange={(nextOpen) => { if (!nextOpen) closeAssignmentModal(); }}>
        <DialogContent className="max-w-xl w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-jakarta">Assign Volunteer Work via Chatbot</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              {assignmentVolunteer
                ? `Volunteer: ${assignmentVolunteer.full_name}`
                : 'Select a volunteer to assign work.'}
            </div>

            <div>
              <Label>Task *</Label>
              <Textarea
                className="mt-1"
                value={assignmentTask}
                onChange={(e) => setAssignmentTask(e.target.value)}
                placeholder="Describe the work assignment..."
              />
            </div>

            <div>
              <Label>Need Title (optional)</Label>
              <Input
                className="mt-1"
                value={assignmentNeedTitle}
                onChange={(e) => setAssignmentNeedTitle(e.target.value)}
                placeholder="Example: Ward 3 Medical Support"
              />
            </div>

            <div>
              <Label>Volunteer WhatsApp Number *</Label>
              <Input
                className="mt-1"
                value={assignmentPhone}
                onChange={(e) => setAssignmentPhone(e.target.value)}
                placeholder="+919999999999"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={assignmentPriority} onValueChange={setAssignmentPriority}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {assignmentPriorities.map((priority) => (
                      <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Due Date / Time (optional)</Label>
                <Input
                  className="mt-1"
                  value={assignmentDueDate}
                  onChange={(e) => setAssignmentDueDate(e.target.value)}
                  placeholder="today 6 PM"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={closeAssignmentModal} disabled={assigning}>Cancel</Button>
            <Button onClick={submitAssignment} disabled={assigning || !assignmentTask.trim()}>
              {assigning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send Assignment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
