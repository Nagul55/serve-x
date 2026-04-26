import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { servexApi } from '@/api/servexClient';
import StatCard from '@/components/dashboard/StatCard';
import NeedsPriorityList from '@/components/dashboard/NeedsPriorityList';
import VolunteerAvailability from '@/components/dashboard/VolunteerAvailability';
import CategoryChart from '@/components/dashboard/CategoryChart';
import InteractiveMap from '@/components/dashboard/InteractiveMap';
import { AlertTriangle, Users, Send, CheckCircle, Clock, MapPin } from 'lucide-react';

export default function Dashboard() {
  const [highlightedNeedId, setHighlightedNeedId] = useState(null);

  const { data: needs = [] } = useQuery({
    queryKey: ['needs'],
    queryFn: () => servexApi.entities.CommunityNeed.list('-created_date', 100),
  });
  
  const { data: volunteers = [] } = useQuery({
    queryKey: ['volunteers'],
    queryFn: () => servexApi.entities.Volunteer.list('-created_date', 100),
  });
  
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => servexApi.entities.Dispatch.list('-created_date', 50),
  });

  const handleSelectNeed = useCallback((needId) => {
    setHighlightedNeedId(needId);
    
    // Smooth scroll to the card
    setTimeout(() => {
      const element = document.getElementById(`need-card-${needId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash effect
        element.classList.add('ring-4', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          element.classList.remove('ring-4', 'ring-primary', 'ring-offset-2');
        }, 2000);
      }
    }, 100);
  }, []);

  const criticalNeeds = needs.filter(n => n.urgency_level === 'critical' && n.status !== 'resolved').length;
  const unaddressed = needs.filter(n => n.status === 'unaddressed').length;
  const resolved = needs.filter(n => n.status === 'resolved').length;
  const activeVols = volunteers.filter(v => v.status === 'active').length;
  const activeDispatches = dispatches.filter(d => d.status === 'active').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-jakarta text-foreground">Command Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time overview of community needs and volunteer coordination</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Critical Needs" value={criticalNeeds} subtitle="Require immediate action" icon={AlertTriangle} color="red" />
        <StatCard title="Unaddressed" value={unaddressed} subtitle="Needs awaiting response" icon={Clock} color="orange" />
        <StatCard title="Active Volunteers" value={activeVols} subtitle={`of ${volunteers.length} total`} icon={Users} color="blue" />
        <StatCard title="Resolved" value={resolved} subtitle="Needs closed" icon={CheckCircle} color="green" />
      </div>

      {/* Interactive Intelligence Map */}
      <div className="space-y-3">
        <h3 className="font-semibold font-jakarta text-foreground flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          Community Intelligence Map
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Live</span>
        </h3>
        <InteractiveMap needs={needs} onSelectNeed={handleSelectNeed} />
      </div>

      {/* Active dispatches banner */}
      {activeDispatches > 0 && (
        <div className="bg-gradient-to-r from-servex-periwinkle/30 to-servex-blush/80 border border-servex-periwinkle/70 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Send className="w-5 h-5 text-servex-navy flex-shrink-0" />
          <div>
            <span className="font-semibold text-foreground text-sm">{activeDispatches} active dispatch{activeDispatches > 1 ? 'es' : ''}</span>
            <span className="text-muted-foreground text-sm"> - volunteers currently deployed in the field.</span>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NeedsPriorityList needs={needs} highlightedId={highlightedNeedId} />
        </div>
        <div>
          <VolunteerAvailability volunteers={volunteers} />
        </div>
      </div>

      {/* Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryChart needs={needs} />
        <div className="bg-card/95 rounded-xl border border-servex-periwinkle/70 p-5 shadow-sm">
          <h3 className="font-semibold font-jakarta text-foreground mb-4">Needs by Status</h3>
          <div className="space-y-3">
            {[
              { label: 'Unaddressed', count: unaddressed, total: needs.length, color: 'bg-servex-navy' },
              { label: 'Assigned', count: needs.filter(n => n.status === 'assigned').length, total: needs.length, color: 'bg-servex-indigo' },
              { label: 'In Progress', count: needs.filter(n => n.status === 'in_progress').length, total: needs.length, color: 'bg-servex-periwinkle' },
              { label: 'Resolved', count: resolved, total: needs.length, color: 'bg-servex-blush' },
            ].map(({ label, count, total, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs sm:text-sm text-muted-foreground w-20 sm:w-24">{label}</span>
                <div className="flex-1 h-2 bg-servex-blush/80 border border-servex-periwinkle/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color} transition-all`} style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }} />
                </div>
                <span className="text-xs sm:text-sm font-medium text-foreground w-7 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
