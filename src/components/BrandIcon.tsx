const iconUrl = new URL('../assets/topnote-icon.png', import.meta.url).href

export function BrandIcon() {
  return <img className="brand-icon" src={iconUrl} alt="" aria-hidden="true"/>
}
