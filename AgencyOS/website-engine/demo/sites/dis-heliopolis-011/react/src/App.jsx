export default function App() {
  return (
    <div className="site">
<header className={"nav"} role={"banner"} data-section={"navbar"}>
  <div className={"container"}>
    <nav className={"nav__inner"} aria-label={"Main navigation"}>
      <a className={"nav__brand"} href={"#home"}>
        <img src={"/logo/logo-light.png"} alt={"Heliopolis Clinic Logo"} height={"36"} />
{"HELIOPOLIS"}
      </a>
      <button className={"nav__toggle"} type={"button"} data-nav-toggle={""} aria-label={"Open menu"} aria-expanded={"false"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div className={"nav__right"}>
        <ul className={"nav__links"} id={"site-menu"}>
          <li>
            <a className={"nav__link"} aria-label={"Home"} href={"#home"}>
{"Home"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Services"} href={"#services"}>
{"Services"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Stats"} href={"#stats"}>
{"Stats"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Reviews"} href={"#testimonials"}>
{"Reviews"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Gallery"} href={"#gallery"}>
{"Gallery"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Location"} href={"#location"}>
{"Location"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Contact"} href={"#contact"}>
{"Contact"}
            </a>
          </li>
        </ul>
        <div className={"nav__icon-row"}>
          <button className={"theme-toggle"} type={"button"} data-theme-toggle={""} aria-label={"Toggle dark/light mode"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>
          </button>
          <span className={"nav__cta"}>
            <a className={"btn btn--primary"} aria-label={"Book a Visit"} href={"#contact"}>
{"Book a Visit"}
            </a>
          </span>
        </div>
      </div>
    </nav>
  </div>
</header>
<section className={"sec sec--alt"} data-section={"hero"} id={"home"} aria-label={"Introduction"}>
  <div className={"hero__bg"} aria-hidden={"true"}>
    <img src={"/hero/light-hero.jpg"} alt={""} className={"img--cover"} aria-hidden={"true"} />
  </div>
  <div className={"hero__inner"}>
    <div className={"hero__inner"}>
      <div className={"container"}>
        <div className={"hero__grid"}>
          <div>
            <span className={"hero__eyebrow"}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Welcome to"}
            </span>
            <h1 className={"hero__title"}>
{"HELIOPOLIS"}
            </h1>
            <p className={"hero__subtitle"}>
{"MEDICAL CLINIC"}
            </p>
            <p className={"hero__desc"}>
{"Medical Clinic Reach us today."}
            </p>
            <div className={"hero__cta"}>
              <a className={"btn btn--primary"} href={"#services"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Explore"}
              </a>
              <a className={"btn btn--secondary"} href={"#contact"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4L8 10a12 12 0 0 0 6 6l2-2.5 4 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4z"/></svg>
{"Contact Us"}
              </a>
            </div>
            <div className={"hero__info"}>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div>
                  <strong>
{"45 El Thawra St"}
                  </strong>
                  <span>
{"Cairo"}
                  </span>
                </div>
              </div>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                <div>
                  <strong>
{"Open Daily"}
                  </strong>
                  <span>
{"9:00 AM - 9:00 PM"}
                  </span>
                </div>
              </div>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>
                <div>
                  <strong>
{"{rating} Rating"}
                  </strong>
                  <span>
{"(176+ Reviews)"}
                  </span>
                </div>
              </div>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l8 3v6c0 5.5-3.5 9.5-8 11-4.5-1.5-8-5.5-8-11V5z"/><path d="M8.5 11.5l2.5 2.5 4.5-5"/></svg>
                <div>
                  <strong>
{"Clean & Safe"}
                  </strong>
                  <span>
{"Specialist team"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"hero__visual"}>
            <img src={"/hero/light-hero.jpg"} alt={"Heliopolis Clinic Ambiance"} className={"img--cover"} />
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"services"} id={"services"} aria-label={"Services"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Our Services"}
      </span>
      <h2 className={"sec__title"}>
{"What we offer"}
      </h2>
    </div>
    <div className={"grid grid--3"}>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"Consultations"}
        </h3>
        <p>
{""}
        </p>
        <a className={"btn btn--secondary"} href={"#contact"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16"/><path d="M14 6l6 6-6 6"/></svg>
{"Learn more"}
        </a>
      </div>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"Check-ups"}
        </h3>
        <p>
{""}
        </p>
        <a className={"btn btn--secondary"} href={"#contact"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16"/><path d="M14 6l6 6-6 6"/></svg>
{"Learn more"}
        </a>
      </div>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"Specialist referrals"}
        </h3>
        <p>
{""}
        </p>
        <a className={"btn btn--secondary"} href={"#contact"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16"/><path d="M14 6l6 6-6 6"/></svg>
{"Learn more"}
        </a>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--deep sec--alt"} data-section={"stats"} id={"stats"} aria-label={"Statistics"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"By The Numbers"}
      </span>
      <h2 className={"sec__title"}>
{"Our stats"}
      </h2>
    </div>
    <div className={"stats__grid"}>
      <div className={"stat"} id={"stat-rating"}>
        <div className={"stat__value"}>
{"4.4/5"}
        </div>
        <div className={"stat__label"}>
{"Average Rating"}
        </div>
      </div>
      <div className={"stat"} id={"stat-reviews"}>
        <div className={"stat__value"}>
{"176+"}
        </div>
        <div className={"stat__label"}>
{"Reviews"}
        </div>
      </div>
      <div className={"stat"} id={"stat-patients"}>
        <div className={"stat__value"}>
{"20000+"}
        </div>
        <div className={"stat__label"}>
{"Patients Treated"}
        </div>
      </div>
      <div className={"stat"} id={"stat-years"}>
        <div className={"stat__value"}>
{"14"}
        </div>
        <div className={"stat__label"}>
{"Years of Care"}
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt sec--alt"} data-section={"testimonials"} id={"testimonials"} aria-label={"Testimonials"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Testimonials"}
      </span>
      <h2 className={"sec__title"}>
{"What our clients say"}
      </h2>
    </div>
    <div className={"reviews__grid"}>
      <div className={"review"}>
        <span className={"review__stars"} role={"img"} aria-label={"4 out of 5 stars"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>
        </span>
        <p className={"review__text"}>
{"Great quality and even better service. Will come back."}
        </p>
        <div>
          <div className={"review__name"}>
{"Hana Youssef"}
          </div>
          <div className={"review__role"}>
{"First Time Visitor"}
          </div>
        </div>
      </div>
      <div className={"review"}>
        <span className={"review__stars"} role={"img"} aria-label={"4 out of 5 stars"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>
        </span>
        <p className={"review__text"}>
{"Top notch from start to finish. Booking was effortless."}
        </p>
        <div>
          <div className={"review__name"}>
{"Sara Mostafa"}
          </div>
          <div className={"review__role"}>
{"Frequent Visitor"}
          </div>
        </div>
      </div>
      <div className={"review"}>
        <span className={"review__stars"} role={"img"} aria-label={"4 out of 5 stars"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>
        </span>
        <p className={"review__text"}>
{"Best experience in the area — highly recommended."}
        </p>
        <div>
          <div className={"review__name"}>
{"Omar Farouk"}
          </div>
          <div className={"review__role"}>
{"Frequent Visitor"}
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"gallery"} id={"gallery"} aria-label={"Gallery"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Our Gallery"}
      </span>
      <h2 className={"sec__title"}>
{"A glimpse of our place"}
      </h2>
    </div>
    <div className={"gallery__grid"} role={"list"} aria-label={"More photos"}>
      <figure className={"gallery__item"} id={"gallery-item-1"}>
        <img src={"/placeholders/image-2.svg"} alt={"Gallery photo 1"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 1"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-2"}>
        <img src={"/placeholders/image-3.svg"} alt={"Gallery photo 2"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 2"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-3"}>
        <img src={"/placeholders/image-4.svg"} alt={"Gallery photo 3"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 3"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-4"}>
        <img src={"/placeholders/image-5.svg"} alt={"Gallery photo 4"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 4"}
        </figcaption>
      </figure>
    </div>
  </div>
</section>
<section className={"sec sec--alt sec--alt"} data-section={"location"} id={"location"} aria-label={"Location"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Visit us"}
      </span>
      <h2 className={"sec__title"}>
{"Our location"}
      </h2>
    </div>
    <div className={"contact__grid"}>
      <div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <strong>
{"Address"}
            </strong>
            <span>
{"45 El Thawra St, Cairo"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <strong>
{"Area"}
            </strong>
            <span>
{"Cairo"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <div>
            <strong>
{"Opening Hours"}
            </strong>
            <ul className={"contact__hours"}>
              <li>
                <span>
{"Monday - Sunday"}
                </span>
                <span>
{"10:00 AM - 10:00 PM"}
                </span>
              </li>
            </ul>
          </div>
        </div>
        <a className={"btn btn--secondary"} href={"https://maps.google.com/?q=Cairo"} rel={"noopener noreferrer"} target={"_blank"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
{"Get Directions"}
        </a>
      </div>
      <a aria-label={"Open map in new tab"} rel={"noopener noreferrer"} target={"_blank"} href={"https://maps.google.com/?q=Cairo"}>
        <img src={"/backgrounds/map-dark.png"} alt={"Map to 45 El Thawra St, Cairo"} className={"map-frame"} width={"600"} height={"320"} />
      </a>
    </div>
  </div>
</section>
<section className={"sec sec--alt sec--alt"} data-section={"about"} id={"features"} aria-label={"About"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Why Choose Us"}
      </span>
      <h2 className={"sec__title"}>
{"The Heliopolis Clinic experience"}
      </h2>
    </div>
    <p className={"sec__sub"}>
{"Medical Clinic in Cairo"}
    </p>
    <div className={"grid grid--3"}>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"Strong business fundamentals (63/100)"}
        </h3>
        <p>
{"business score"}
        </p>
      </div>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"High local demand (71/100)"}
        </h3>
        <p>
{"opportunity score"}
        </p>
      </div>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"176 customer reviews build trust"}
        </h3>
        <p>
{"review count"}
        </p>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"contact"} id={"contact"} aria-label={"Contact"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Get in touch"}
      </span>
      <h2 className={"sec__title"}>
{"Contact us"}
      </h2>
    </div>
    <div className={"contact__grid"}>
      <div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4L8 10a12 12 0 0 0 6 6l2-2.5 4 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4z"/></svg>
          <div>
            <strong>
{"Phone"}
            </strong>
            <span>
{"+20 22 401 234"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>
          <div>
            <strong>
{"WhatsApp"}
            </strong>
            <span>
{"+20 22 401 234"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          <div>
            <strong>
{"Email"}
            </strong>
            <span>
{"care@helioclinic.example"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <strong>
{"Address"}
            </strong>
            <span>
{"45 El Thawra St, Cairo"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <div>
            <strong>
{"Hours"}
            </strong>
            <span>
{"Monday - Sunday: 10:00 AM - 10:00 PM"}
            </span>
          </div>
        </div>
        <div>
          <a className={"nav__link"} aria-label={"whatsapp"} rel={"noopener noreferrer"} target={"_blank"} href={"https://wa.me/201000000012"}>
{"whatsapp"}
          </a>
        </div>
      </div>
      <div>
        <strong>
{"Find us on the map"}
        </strong>
        <a aria-label={"Open map in new tab"} rel={"noopener noreferrer"} target={"_blank"} href={"https://maps.google.com/?q=Cairo"}>
          <img src={"/backgrounds/map-dark.png"} alt={"Map"} className={"img--cover map-frame"} width={"600"} height={"320"} />
        </a>
      </div>
    </div>
  </div>
</section>
<footer className={"footer"} id={"footer"} role={"contentinfo"} data-section={"footer"}>
  <div className={"container"}>
    <div className={"footer__grid"}>
      <div>
        <div className={"footer__brand"}>
{"HELIOPOLIS"}
        </div>
        <p>
{"Heliopolis Clinic — Medical Clinic, serving Cairo."}
        </p>
      </div>
      <div>
        <div className={"footer__title"}>
{"Quick Links"}
        </div>
        <ul className={"footer__links"}>
          <li>
            <a href={"#home"}>
{"Home"}
            </a>
          </li>
          <li>
            <a href={"#services"}>
{"Services"}
            </a>
          </li>
          <li>
            <a href={"#stats"}>
{"Stats"}
            </a>
          </li>
          <li>
            <a href={"#testimonials"}>
{"Reviews"}
            </a>
          </li>
          <li>
            <a href={"#gallery"}>
{"Gallery"}
            </a>
          </li>
          <li>
            <a href={"#location"}>
{"Location"}
            </a>
          </li>
          <li>
            <a href={"#contact"}>
{"Contact"}
            </a>
          </li>
        </ul>
      </div>
      <div>
        <div className={"footer__title"}>
{"Contact Us"}
        </div>
        <ul className={"footer__links"}>
          <li>
{"+20 22 401 234"}
          </li>
          <li>
            <a href={"mailto:care@helioclinic.example"}>
{"care@helioclinic.example"}
            </a>
          </li>
          <li>
{"45 El Thawra St, Cairo"}
          </li>
        </ul>
        <div className={"footer__links"}>
          <a aria-label={"whatsapp profile"} rel={"noopener noreferrer"} target={"_blank"} href={"https://wa.me/201000000012"}>
{"whatsapp"}
          </a>
        </div>
      </div>
      <div>
        <div className={"footer__title"}>
{"Opening Hours"}
        </div>
        <ul className={"footer__links"}>
          <li>
{"Monday - Sunday: 10:00 AM - 10:00 PM"}
          </li>
        </ul>
      </div>
    </div>
    <div className={"footer__bottom"}>
      <span>
{"© Heliopolis Clinic All rights reserved."}
      </span>
      <span>
{"Built with AgencyOS Website Engine"}
      </span>
    </div>
  </div>
</footer>
    </div>
  );
}
