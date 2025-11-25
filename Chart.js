function renderHandicapGraph(history, playerName) {
    const ctx = document.getElementById("handicapChart");

    // Détruire l'ancien graphique s'il existe
    if (handicapChart !== null) {
        handicapChart.destroy();
    }

    handicapChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: history.map(h => h.date),
            datasets: [{
                label: `Handicap - ${playerName}`,
                data: history.map(h => h.handicap),
                borderWidth: 3,
                borderColor: "#2563eb",
                backgroundColor: "rgba(37, 99, 235, 0.2)",
                tension: 0.2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true },
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
}
