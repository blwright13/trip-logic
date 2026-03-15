"""Home page with search and destinations."""

import from "lucide-react" { Search, ArrowRight }

import from ..components.Header { Header }
import from ..components.TripCard { TripCard }

def:pub LandingPage(
    searchQuery: str,
    quickTags: list,
    destinations: list,
    onSearchChange: any,
    onSearchSubmit: any,
    onTagClick: any,
    onDestinationClick: any,
    onLogoClick: any,
    onNewTrip: any
) -> any {
    return
        <div className="flex flex-col min-h-screen bg-background">
            <Header
                onLogoClick={onLogoClick}
                showNewTrip={True}
                onNewTrip={onNewTrip}
            />

            <main className="flex-1 flex flex-col items-center justify-center px-4">
                <div className="max-w-2xl w-full text-center mt-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight mb-3">
                        Plan your perfect trip
                    </h1>
                    <p className="text-muted-foreground text-lg mb-8">
                        AI-powered itineraries tailored to your style, budget, and timeline.
                    </p>

                    <form onSubmit={onSearchSubmit} className="search-box max-w-xl mx-auto">
                        <span className="search-icon">{<Search size={20} />}</span>
                        <input
                            value={searchQuery}
                            onChange={onSearchChange}
                            placeholder="Where do you want to go?"
                        />
                        <button type="submit" className="btn btn-primary btn-sm flex items-center gap-1.5">
                            <span>Plan Trip</span>
                            {<ArrowRight size={14} />}
                        </button>
                    </form>

                    <div className="flex flex-wrap justify-center gap-2 mt-5">
                        {[
                            <button
                                key={tag}
                                onClick={lambda -> None { onTagClick(tag); }}
                                className="chip"
                            >
                                {tag}
                            </button>
                            for tag in quickTags
                        ]}
                    </div>
                </div>

                <section className="max-w-3xl w-full mt-16 mb-12">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">
                        Popular Destinations
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            <TripCard
                                key={dest.id}
                                dest={dest}
                                onClick={onDestinationClick}
                            />
                            for dest in destinations
                        ]}
                    </div>
                </section>
            </main>
        </div>;
}
