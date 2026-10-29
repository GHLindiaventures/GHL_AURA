import React from 'react';

export const NotSpecifiedBadge: React.FC = () => (
  <span className="kyc-not-specified-badge">Not Specified</span>
);

export interface SpecifiedValueBadgeProps {
  value: string | null | undefined;
  style?: React.CSSProperties;
}

export const SpecifiedValueBadge: React.FC<SpecifiedValueBadgeProps> = ({
  value,
  style = { color: '#10b981', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', display: 'inline-block' },
}) => {
  const isSpecified = Boolean(
    value &&
    value !== '—' &&
    value.trim() !== '' &&
    value.toLowerCase() !== 'not specified'
  );
  return isSpecified ? <span style={style}>{value}</span> : <NotSpecifiedBadge />;
};

export interface PreferredAssetBadgeProps {
  preferredAssetClass: string | null | undefined;
}

export const PreferredAssetBadge: React.FC<PreferredAssetBadgeProps> = ({ preferredAssetClass }) => {
  const isSpecified = Boolean(
    preferredAssetClass &&
    preferredAssetClass !== '—' &&
    preferredAssetClass.trim() !== '' &&
    preferredAssetClass.toLowerCase() !== 'not specified'
  );
  return isSpecified ? <span className="kyc-pref-badge">{preferredAssetClass}</span> : <NotSpecifiedBadge />;
};

