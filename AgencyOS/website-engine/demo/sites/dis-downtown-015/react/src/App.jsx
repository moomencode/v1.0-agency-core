export default function App() {
  return (
    <div className="site">
<header className={"nav"} role={"banner"} data-section={"navbar"}>
  <div className={"container"}>
    <nav className={"nav__inner"} aria-label={"Main navigation"}>
      <a className={"nav__brand"} href={"#home"}>
        <img src={"/logo/logo-light.png"} alt={"Nile Books Logo"} height={"36"} />
{"NILE"}
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
            <a className={"nav__link"} aria-label={"Why Us"} href={"#features"}>
{"Why Us"}
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
            <a className={"nav__link"} aria-label={"Contact"} href={"#contact"}>
{"Contact"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Location"} href={"#location"}>
{"Location"}
            </a>
          </li>
        </ul>
        <div className={"nav__icon-row"}>
          <button className={"theme-toggle"} type={"button"} data-theme-toggle={""} aria-label={"Toggle dark/light mode"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>
          </button>
          <span className={"nav__cta"}>
            <a className={"btn btn--primary"} aria-label={"Book Now"} href={"#contact"}>
{"Book Now"}
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
{"NILE"}
            </h1>
            <p className={"hero__subtitle"}>
{"LOCAL BUSINESS"}
            </p>
            <p className={"hero__desc"}>
{"Local Business Reach us today."}
            </p>
            <div className={"hero__cta"}>
              <a className={"btn btn--primary"} href={"#features"}>
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
{"7 Kasr El Nil"}
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
{"10:00 AM - 10:00 PM"}
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
{"(55+ Reviews)"}
                  </span>
                </div>
              </div>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v-6z"/><path d="M20 14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v-6z"/></svg>
                <div>
                  <strong>
{"Real Support"}
                  </strong>
                  <span>
{"WhatsApp friendly"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"hero__visual"}>
            <img src={"/hero/light-hero.jpg"} alt={"Nile Books Ambiance"} className={"img--cover"} />
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"about"} id={"features"} aria-label={"About"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Why Choose Us"}
      </span>
      <h2 className={"sec__title"}>
{"The Nile Books experience"}
      </h2>
    </div>
    <p className={"sec__sub"}>
{"Local Business in Cairo"}
    </p>
    <div className={"grid grid--3"}>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"55 customer reviews build trust"}
        </h3>
        <p>
{"review count"}
        </p>
      </div>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"Has a live website"}
        </h3>
        <p>
{"website probe"}
        </p>
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
{"4.0/5"}
        </div>
        <div className={"stat__label"}>
{"Average Rating"}
        </div>
      </div>
      <div className={"stat"} id={"stat-reviews"}>
        <div className={"stat__value"}>
{"55+"}
        </div>
        <div className={"stat__label"}>
{"Reviews"}
        </div>
      </div>
      <div className={"stat"} id={"stat-clients"}>
        <div className={"stat__value"}>
{"1500+"}
        </div>
        <div className={"stat__label"}>
{"Happy Clients"}
        </div>
      </div>
      <div className={"stat"} id={"stat-years"}>
        <div className={"stat__value"}>
{"5"}
        </div>
        <div className={"stat__label"}>
{"Years in Business"}
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"testimonials"} id={"testimonials"} aria-label={"Testimonials"}>
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
{"Consistently excellent. This is my favorite spot now."}
        </p>
        <div>
          <div className={"review__name"}>
{"Hassan Amr"}
          </div>
          <div className={"review__role"}>
{"Long-time Client"}
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
{"Mariam Fathy"}
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
{"Friendly staff, fair prices and a wonderful atmosphere."}
        </p>
        <div>
          <div className={"review__name"}>
{"Sherif Adel"}
          </div>
          <div className={"review__role"}>
{"First Time Visitor"}
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
        <img src={"/placeholders/image-3.svg"} alt={"Gallery photo 1"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 1"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-2"}>
        <img src={"/placeholders/image-4.svg"} alt={"Gallery photo 2"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 2"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-3"}>
        <img src={"/placeholders/image-5.svg"} alt={"Gallery photo 3"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 3"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-4"}>
        <img src={"/placeholders/image-6.svg"} alt={"Gallery photo 4"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 4"}
        </figcaption>
      </figure>
    </div>
  </div>
</section>
<section className={"sec"} data-section={"contact"} id={"contact"} aria-label={"Contact"}>
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
{"+20 27 334 455"}
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
{"+20 27 334 455"}
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
{"books@nilebooks.example"}
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
{"7 Kasr El Nil, Cairo"}
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
          <a className={"nav__link"} aria-label={"whatsapp"} rel={"noopener noreferrer"} target={"_blank"} href={"https://wa.me/201000000016"}>
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
{"7 Kasr El Nil, Cairo"}
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
        <img src={"/backgrounds/map-dark.png"} alt={"Map to 7 Kasr El Nil, Cairo"} className={"map-frame"} width={"600"} height={"320"} />
      </a>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"cta"} id={"cta"} aria-label={"Call to action"}>
  <div className={"cta"}>
    <div className={"container"}>
      <div className={"cta__inner"}>
        <h2 className={"cta__title"}>
{"Local Business in Cairo"}
        </h2>
        <div className={"cta__actions"}>
          <a className={"btn btn--primary"} href={"#contact"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/></svg>
{"Book Now"}
          </a>
          <a className={"btn btn--secondary"} href={"tel:+2027334455"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4L8 10a12 12 0 0 0 6 6l2-2.5 4 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4z"/></svg>
{"Call Us"}
          </a>
        </div>
      </div>
    </div>
  </div>
</section>
<footer className={"footer"} id={"footer"} role={"contentinfo"} data-section={"footer"}>
  <div className={"container"}>
    <div className={"footer__grid"}>
      <div>
        <div className={"footer__brand"}>
{"NILE"}
        </div>
        <p>
{"Nile Books — Local Business, serving Cairo."}
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
            <a href={"#features"}>
{"Why Us"}
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
            <a href={"#contact"}>
{"Contact"}
            </a>
          </li>
          <li>
            <a href={"#location"}>
{"Location"}
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
{"+20 27 334 455"}
          </li>
          <li>
            <a href={"mailto:books@nilebooks.example"}>
{"books@nilebooks.example"}
            </a>
          </li>
          <li>
{"7 Kasr El Nil, Cairo"}
          </li>
        </ul>
        <div className={"footer__links"}>
          <a aria-label={"whatsapp profile"} rel={"noopener noreferrer"} target={"_blank"} href={"https://wa.me/201000000016"}>
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
{"© Nile Books All rights reserved."}
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
