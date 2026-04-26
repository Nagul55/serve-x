import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { servexApi } from '@/api/servexClient';

const SKILLS = [
  'medical', 'education', 'food_distribution', 'transportation', 'counseling',
  'elderly_care', 'childcare', 'logistics', 'tech', 'languages', 'other'
];
const AVAILABILITY = ['weekdays', 'weekends', 'both', 'on_call'];
const STATUS = ['active', 'deployed', 'unavailable'];

export default function VolunteerFormModal({ open, onClose, onSaved, initial = null }) {
  const [form, setForm] = useState(initial || {
    full_name: '',
    email: '',
    phone: '',
    skills: [],
    availability: 'weekends',
    status: 'active',
    location: '',
    languages: [],
    bio: ''
  });
  const [skillsText, setSkillsText] = useState((initial?.skills || []).join(', '));
  const [languagesText, setLanguagesText] = useState((initial?.languages || []).join(', '));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const data = {
      ...form,
      skills: skillsText.split(',').map(s => s.trim()).filter(Boolean),
      languages: languagesText.split(',').map(s => s.trim()).filter(Boolean),
    };

    if (initial?.id) {
      await servexApi.entities.Volunteer.update(initial.id, data);
    } else {
      await servexApi.entities.Volunteer.create(data);
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-jakarta">{initial ? 'Edit Volunteer' : 'Add Volunteer'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full Name *</Label>
              <Input className="mt-1" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Volunteer name" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input className="mt-1" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="Phone number" />
            </div>
            <div>
              <Label>Location</Label>
              <Input className="mt-1" value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="Area / neighborhood" />
            </div>
            <div>
              <Label>Availability</Label>
              <Select value={form.availability} onValueChange={v => set('availability', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AVAILABILITY.map(a => <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Skills (comma separated)</Label>
              <Input className="mt-1" value={skillsText} onChange={e => setSkillsText(e.target.value)} placeholder="medical, transportation, logistics" />
            </div>
            <div className="col-span-2">
              <Label>Languages (comma separated)</Label>
              <Input className="mt-1" value={languagesText} onChange={e => setLanguagesText(e.target.value)} placeholder="English, Hindi, Tamil" />
            </div>
            <div className="col-span-2">
              <Label>Bio</Label>
              <Textarea className="mt-1" value={form.bio || ''} onChange={e => set('bio', e.target.value)} placeholder="Background and strengths..." />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.full_name || !form.email}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {initial ? 'Update Volunteer' : 'Save Volunteer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

