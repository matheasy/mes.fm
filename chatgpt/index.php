<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hidden Lists</title>
    <style>
        .hidden {
            display: none;
        }

        .list-header {
            cursor: pointer;
        }

        .arrow-icon {
            font-size: 20px;
            display: inline-block;
            transition: transform 0.3s ease;
        }
    </style>
</head>
<body>

<h1 class="list-header" onclick="toggleAllLists()">
    All Lists
    <span id="arrowIconAll" class="arrow-icon">&#9660;</span>
</h1>

<div class="list-container">
    <h1 class="list-header" onclick="toggleList('list1')">
        List 1
        <span id="arrowIcon1" class="arrow-icon">&#9660;</span>
    </h1>

    <ul id="list1">
        <li class="item">Item 1.1</li>
        <li class="item">Item 1.2</li>
        <li class="item">Item 1.3</li>
    </ul>
</div>

<div class="list-container">
    <h1 class="list-header" onclick="toggleList('list2')">
        List 2
        <span id="arrowIcon2" class="arrow-icon">&#9660;</span>
    </h1>

    <ul id="list2">
        <li class="item">Item 2.1</li>
        <li class="item">Item 2.2</li>
        <li class="item">Item 2.3</li>
    </ul>
</div>

<script>
    function toggleAllLists() {
        const lists = document.querySelectorAll('.list-container ul');
        const arrowIconAll = document.getElementById('arrowIconAll');

        lists.forEach(list => {
            list.classList.toggle('hidden');
        });

        arrowIconAll.textContent = lists[0].classList.contains('hidden') ? '\u25B2' : '\u25BC';
    }

    function toggleList(listId) {
        const list = document.getElementById(listId);
        const arrowIcon = document.getElementById(`arrowIcon${listId.slice(-1)}`);

        list.classList.toggle('hidden');
        arrowIcon.textContent = list.classList.contains('hidden') ? '\u25B2' : '\u25BC';
    }
</script>

</body>
</html>
