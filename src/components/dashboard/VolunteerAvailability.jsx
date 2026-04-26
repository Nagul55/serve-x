import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function VolunteerAvailability({ volunteers = [] }) {
  const active = volunteers.filter(v => v.status === 'active').slice(0, 6);

  return (
    <div className="bg-card/95 rounded-xl border border-servex-periwinkle/70 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold font-jakarta text-foreground">Available Volunteers</h3>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/volunteers" className="flex items-center gap-1 text-primary text-xs">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No volunteers available.</p>
      ) : (
        <div className="space-y-3">
          {active.map(vol => (
            <div key={vol.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-servex-blush/70 transition-colors">
              <div className="w-8 h-8 rounded-full bg-servex-periwinkle/45 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-servex-navy">
                  {vol.full_name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{vol.full_name}</div>
                <div className="text-xs text-muted-foreground">{vol.location || 'No location'}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-servex-indigo"></div>
                <span className="text-xs text-muted-foreground">Active</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
