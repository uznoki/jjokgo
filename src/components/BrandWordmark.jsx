export function BrandWordmark({className=""}){
  return <span className={`brandWordmark ${className}`.trim()} role="img" aria-label="쪽GO">
    <img className="brandImage" src="/jjokgo-wordmark-orange.svg" alt="" aria-hidden="true"/>
  </span>;
}
