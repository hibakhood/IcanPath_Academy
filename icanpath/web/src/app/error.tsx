"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="section"><h1>We couldn’t load this page.</h1><p>Please try again.</p><button className="button" onClick={reset}>Try again</button></section>}
