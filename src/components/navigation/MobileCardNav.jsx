import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import './mobile-card-nav.css';

const navCards = [
  {
    label: 'Overview',
    bgColor: '#1B1722',
    textColor: '#fff',
    links: [
      { label: 'Dashboard', path: '/' },
      { label: 'Community Needs', path: '/needs' },
    ],
  },
  {
    label: 'Operations',
    bgColor: '#2F293A',
    textColor: '#fff',
    links: [
      { label: 'Volunteers', path: '/volunteers' },
      { label: 'Dispatch', path: '/dispatch' },
    ],
  },
  {
    label: 'Reports',
    bgColor: '#3D3550',
    textColor: '#fff',
    links: [
      { label: 'Field Reports', path: '/field-reports' },
    ],
  },
];

export default function MobileCardNav({
  open,
  onToggle,
  onNavigate,
  onLogout,
}) {
  return (
    <div className="mobile-card-nav-container lg:hidden">
      <nav className={`mobile-card-nav ${open ? 'open' : ''}`}>
        <div className="mobile-card-nav-top">
          <span className="mobile-card-nav-logo">ServeX</span>
          <button
            type="button"
            className={`mobile-hamburger-menu ${open ? 'open' : ''}`}
            onClick={onToggle}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span className="mobile-hamburger-line" />
            <span className="mobile-hamburger-line" />
          </button>
        </div>

        <div className="mobile-card-nav-content" aria-hidden={!open}>
          {navCards.map((item) => (
            <div
              key={item.label}
              className="mobile-nav-card"
              style={{ backgroundColor: item.bgColor, color: item.textColor }}
            >
              <div className="mobile-nav-card-label">{item.label}</div>
              <div className="mobile-nav-card-links">
                {item.links.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className="mobile-nav-card-link"
                    onClick={onNavigate}
                  >
                    <ArrowUpRight className="mobile-nav-card-link-icon" aria-hidden="true" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="mobile-card-nav-logout"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </nav>
    </div>
  );
}
