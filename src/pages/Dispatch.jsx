import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { servexApi } from '@/api/servexClient';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Calendar, Users, CheckCircle, X } from 'lucide-react';
import { format } from 'date-fns';

const statusConfig = {
  pending: { label: 'Pending', className: 'bg-servex-blush text-servex-navy border border-servex-periwinkle/70' },
  active: { label: 'Active', className: 'bg-servex-periwinkle/60 text-servex-navy' },
  completed: { label: 'Completed', className: 'bg-servex-indigo text-servex-blush' },
  resolved: { label: 'Resolved', className: 'bg-servex-navy text-servex-blush' },
  cancelled: { label: 'Cancelled', className: 'bg-secondary text-secondary-foreground' },
};

export default function Dispatch() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => servexApi.entities.Dispatch.list('-created_date', 100),
  });

  const filtered = dispatches.filter(d => filterStatus === 'all' || d.status === filterStatus);

  const updateStatus = async (dispatch, status) => {
    await servexApi.entities.Dispatch.update(dispatch.id, { status });
    if (status === 'completed' && dispatch.need_id) {
      await servexApi.entities.CommunityNeed.update(dispatch.need_id, { status: 'resolved' });
    }
    // When cancelled, reset the need back to unaddressed so it can be re-dispatched
    if (status === 'cancelled' && dispatch.need_id) {
      await servexApi.entities.CommunityNeed.update(dispatch.need_id, { status: 'unaddressed' });
    }
    qc.invalidateQueries(['dispatches']);
    qc.invalidateQueries(['needs']);
    qc.invalidateQueries(['community-needs']);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-jakarta text-foreground">Dispatch Log</h1>
          <p className="text-muted-foreground text-sm mt-1">{dispatches.filter(d => d.status === 'active').length} active deployments</p>
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['pending', 'active', 'completed', 'resolved', 'cancelled'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array(4).fill(0).map((_, i) => <div key={i} className="h-28 bg-card rounded-xl border animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Send className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No dispatches yet</p>
          <p className="text-sm mt-1">Dispatches will appear here when volunteers are assigned to community needs.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(dispatch => {
            const st = statusConfig[dispatch.status] || statusConfig.pending;
            return (
              <div key={dispatch.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h4 className="font-semibold text-foreground">{dispatch.need_title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.className}`}>{st.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {dispatch.volunteer_names?.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4" />
                          {dispatch.volunteer_names.join(', ')}
                        </span>
                      )}
                      {dispatch.scheduled_date && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(dispatch.scheduled_date), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                    {dispatch.notes && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{dispatch.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {dispatch.status === 'active' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateStatus(dispatch, 'completed')} className="gap-1.5 text-primary border-primary/30 hover:bg-servex-blush">
                          <CheckCircle className="w-3.5 h-3.5" /> Complete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(dispatch, 'cancelled')} className="text-muted-foreground">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {dispatch.status === 'pending' && (
                      <Button size="sm" onClick={() => updateStatus(dispatch, 'active')} className="gap-1.5">
                        <Send className="w-3.5 h-3.5" /> Activate
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
