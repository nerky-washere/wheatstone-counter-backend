const BACKEND_URL = 'https://wheatstone-counter-backend.onrender.com'; // Thay URL Render của ông vào đây

async function updateGlobalVisitorCount() {
    const visitElem = document.getElementById('visitCount');
    let localVid = localStorage.getItem('__global_vid');
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/visitor-count`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Visitor-ID': localVid || ''
            },
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.count !== undefined) {
                visitElem.innerText = data.count.toLocaleString();
                if (data.visitor_id) {
                    localStorage.setItem('__global_vid', data.visitor_id);
                }
            }
        }
    } catch (error) {
        console.error("Counter Error:", error);
    }
}

document.addEventListener('DOMContentLoaded', updateGlobalVisitorCount);
